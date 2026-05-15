#include "archicad_adapter/FileRegistryStorage.hpp"

#include <fstream>
#include <sstream>
#include <unordered_map>
#include <utility>
#include <vector>

namespace buildsync {
namespace {

std::string escapeField(const std::string& value)
{
    std::ostringstream out;
    for (unsigned char ch : value) {
        if (ch == '%' || ch == '|' || ch == '\n' || ch == '\r') {
            out << '%' << std::hex;
            if (ch < 16) {
                out << '0';
            }
            out << static_cast<int>(ch) << std::dec;
        } else {
            out << static_cast<char>(ch);
        }
    }
    return out.str();
}

int hexValue(char ch)
{
    if (ch >= '0' && ch <= '9') {
        return ch - '0';
    }
    if (ch >= 'a' && ch <= 'f') {
        return ch - 'a' + 10;
    }
    if (ch >= 'A' && ch <= 'F') {
        return ch - 'A' + 10;
    }
    return -1;
}

std::string unescapeField(const std::string& value)
{
    std::string out;
    for (std::size_t i = 0; i < value.size(); ++i) {
        if (value[i] == '%' && i + 2 < value.size()) {
            const int hi = hexValue(value[i + 1]);
            const int lo = hexValue(value[i + 2]);
            if (hi >= 0 && lo >= 0) {
                out.push_back(static_cast<char>((hi << 4) + lo));
                i += 2;
                continue;
            }
        }
        out.push_back(value[i]);
    }
    return out;
}

std::vector<std::string> splitRecord(const std::string& line)
{
    std::vector<std::string> fields;
    std::string current;
    for (char ch : line) {
        if (ch == '|') {
            fields.push_back(unescapeField(current));
            current.clear();
        } else {
            current.push_back(ch);
        }
    }
    fields.push_back(unescapeField(current));
    return fields;
}

std::string joinRecord(const std::vector<std::string>& fields)
{
    std::ostringstream out;
    for (std::size_t i = 0; i < fields.size(); ++i) {
        if (i > 0) {
            out << '|';
        }
        out << escapeField(fields[i]);
    }
    return out.str();
}

} // namespace

FileRegistryStorage::FileRegistryStorage(std::filesystem::path registryPath)
    : registryPath_(std::move(registryPath))
{
}

bool FileRegistryStorage::load(AssemblyRegistry& registry)
{
    registry.clear();
    if (!std::filesystem::exists(registryPath_)) {
        return true;
    }

    std::ifstream input(registryPath_);
    if (!input) {
        return false;
    }

    std::string line;
    if (!std::getline(input, line) || (line != "BuildSyncRegistry\t1" && line != "BuildSyncRegistry\t2")) {
        return false;
    }
    const bool isV2 = line == "BuildSyncRegistry\t2";

    std::unordered_map<std::string, Assembly> assembliesByUuid;
    std::vector<AssemblyRelationship> relationships;
    std::vector<WrapperComponent> components;
    std::vector<WrapperInstance> instances;
    std::vector<WrapperInstanceMember> instanceMembers;
    while (std::getline(input, line)) {
        if (line.empty()) {
            continue;
        }
        const auto fields = splitRecord(line);
        if (fields.empty()) {
            continue;
        }
        if (fields[0] == "A" && fields.size() == 13) {
            Assembly assembly;
            assembly.assemblyUuid = fields[1];
            assembly.assemblyId = fields[2];
            assembly.name = fields[3];
            assembly.type = fields[4];
            assembly.zone = fields[5];
            assembly.level = fields[6];
            assembly.trade = fields[7];
            assembly.taskId = fields[8];
            try {
                assembly.version = std::stoi(fields[9]);
            } catch (...) {
                assembly.version = 1;
            }
            assembly.status = fields[10];
            assembly.createdAt = fields[11];
            assembly.updatedAt = fields[12];
            assembliesByUuid[assembly.assemblyUuid] = assembly;
        } else if (fields[0] == "M" && fields.size() == 7) {
            auto found = assembliesByUuid.find(fields[1]);
            if (found == assembliesByUuid.end()) {
                continue;
            }
            found->second.members.push_back({fields[1], fields[2], fields[3], fields[4], fields[5], fields[6]});
        } else if (fields[0] == "P" && fields.size() == 4) {
            auto found = assembliesByUuid.find(fields[1]);
            if (found == assembliesByUuid.end() || fields[2].empty()) {
                continue;
            }
            found->second.customProperties.push_back({fields[2], fields[3]});
        } else if (fields[0] == "R" && fields.size() == 6) {
            AssemblyRelationship relationship;
            relationship.parentAssemblyUuid = fields[1];
            relationship.childAssemblyUuid = fields[2];
            relationship.relationshipType = fields[3].empty() ? "contains" : fields[3];
            try {
                relationship.sortOrder = std::stoi(fields[4]);
            } catch (...) {
                relationship.sortOrder = 0;
            }
            relationship.status = fields[5].empty() ? "active" : fields[5];
            relationships.push_back(relationship);
        } else if (isV2 && fields[0] == "C" && (fields.size() == 9 || fields.size() >= 13)) {
            WrapperComponent component;
            component.componentId = fields[1];
            component.sourceAssemblyUuid = fields[2];
            component.sourceElementGuid = fields[3];
            component.elementType = fields[4];
            component.role = fields[5];
            try {
                component.sortOrder = std::stoi(fields[6]);
            } catch (...) {
                component.sortOrder = 0;
            }
            component.snapshotJson = fields[7];
            component.status = fields[8].empty() ? "active" : fields[8];
            if (fields.size() >= 13) {
                try {
                    component.localFrame.originX = std::stod(fields[9]);
                    component.localFrame.originY = std::stod(fields[10]);
                    component.localFrame.rotationDegrees = std::stod(fields[11]);
                    component.localFrame.valid = fields[12] == "true";
                } catch (...) {
                    component.localFrame = {};
                }
            }
            components.push_back(component);
        } else if (isV2 && fields[0] == "I" && (fields.size() == 15 || fields.size() >= 23)) {
            WrapperInstance instance;
            instance.instanceUuid = fields[1];
            instance.sourceAssemblyUuid = fields[2];
            instance.name = fields[3];
            try {
                instance.transform.originX = std::stod(fields[4]);
                instance.transform.originY = std::stod(fields[5]);
                instance.transform.rotationDegrees = std::stod(fields[6]);
            } catch (...) {
                instance.transform = {};
            }
            instance.transform.mirrored = fields[7] == "true";
            instance.isMirrored = fields[7] == "true";
            instance.sourceIsCountable = fields[8] != "false";
            instance.localOverridesAllowed = fields[9] == "true";
            instance.needsRepair = fields[10] == "true";
            instance.status = fields[11].empty() ? "active" : fields[11];
            instance.nativeGroupId = fields[12];
            instance.createdAt = fields[13];
            instance.updatedAt = fields[14];
            if (fields.size() >= 23) {
                try {
                    instance.sourceFrame.originX = std::stod(fields[15]);
                    instance.sourceFrame.originY = std::stod(fields[16]);
                    instance.sourceFrame.rotationDegrees = std::stod(fields[17]);
                    instance.sourceFrame.valid = fields[18] == "true";
                    instance.liveFrame.originX = std::stod(fields[19]);
                    instance.liveFrame.originY = std::stod(fields[20]);
                    instance.liveFrame.rotationDegrees = std::stod(fields[21]);
                    instance.liveFrame.valid = fields[22] == "true";
                } catch (...) {
                    instance.sourceFrame = {};
                    instance.liveFrame = {};
                }
            }
            instances.push_back(instance);
        } else if (isV2 && fields[0] == "IM" && fields.size() == 7) {
            instanceMembers.push_back({fields[1], fields[2], fields[3], fields[4], fields[5], fields[6].empty() ? "active" : fields[6]});
        }
    }

    for (const auto& [_, assembly] : assembliesByUuid) {
        if (!registry.createAssembly(assembly)) {
            return false;
        }
    }
    for (const auto& relationship : relationships) {
        if (relationship.status != "active") {
            continue;
        }
        if (!registry.addChildWrapper(relationship.parentAssemblyUuid, relationship.childAssemblyUuid, relationship.relationshipType)) {
            return false;
        }
    }
    for (const auto& component : components) {
        if (!registry.upsertComponent(component)) {
            return false;
        }
    }
    for (const auto& instance : instances) {
        std::vector<WrapperInstanceMember> members;
        for (const auto& member : instanceMembers) {
            if (member.instanceUuid == instance.instanceUuid) {
                members.push_back(member);
            }
        }
        if (!registry.createInstance(instance, members)) {
            return false;
        }
    }
    return true;
}

bool FileRegistryStorage::save(const AssemblyRegistry& registry)
{
    const auto parent = registryPath_.parent_path();
    if (!parent.empty()) {
        std::filesystem::create_directories(parent);
    }

    std::ofstream output(registryPath_, std::ios::trunc);
    if (!output) {
        return false;
    }

    output << "BuildSyncRegistry\t2\n";
    const auto relationships = registry.listRelationships();
    for (const auto& assembly : registry.listAssemblies()) {
        const bool participatesInTree =
            registry.getParentWrapper(assembly.assemblyUuid).has_value() ||
            !registry.listChildWrappers(assembly.assemblyUuid).empty();
        if (assembly.members.empty() && !participatesInTree) {
            continue;
        }
        output << joinRecord({
                      "A",
                      assembly.assemblyUuid,
                      assembly.assemblyId,
                      assembly.name,
                      assembly.type,
                      assembly.zone,
                      assembly.level,
                      assembly.trade,
                      assembly.taskId,
                      std::to_string(assembly.version),
                      assembly.status,
                      assembly.createdAt,
                      assembly.updatedAt,
                  })
               << "\n";
        for (const auto& property : assembly.customProperties) {
            if (property.key.empty()) {
                continue;
            }
            output << joinRecord({
                          "P",
                          assembly.assemblyUuid,
                          property.key,
                          property.value,
                      })
                   << "\n";
        }
        for (const auto& member : assembly.members) {
            output << joinRecord({
                          "M",
                          assembly.assemblyUuid,
                          member.elementGuid,
                          member.elementType,
                          member.role,
                          member.status,
                          member.addedAt,
                      })
                   << "\n";
        }
    }
    for (const auto& relationship : relationships) {
        output << joinRecord({
                      "R",
                      relationship.parentAssemblyUuid,
                      relationship.childAssemblyUuid,
                      relationship.relationshipType,
                      std::to_string(relationship.sortOrder),
                      relationship.status,
                  })
               << "\n";
    }
    for (const auto& component : registry.listAllComponents()) {
        output << joinRecord({
                      "C",
                      component.componentId,
                      component.sourceAssemblyUuid,
                      component.sourceElementGuid,
                      component.elementType,
                      component.role,
                      std::to_string(component.sortOrder),
                      component.snapshotJson,
                      component.status,
                      std::to_string(component.localFrame.originX),
                      std::to_string(component.localFrame.originY),
                      std::to_string(component.localFrame.rotationDegrees),
                      component.localFrame.valid ? "true" : "false",
                  })
               << "\n";
    }
    for (const auto& instance : registry.listAllInstances()) {
        output << joinRecord({
                      "I",
                      instance.instanceUuid,
                      instance.sourceAssemblyUuid,
                      instance.name,
                      std::to_string(instance.transform.originX),
                      std::to_string(instance.transform.originY),
                      std::to_string(instance.transform.rotationDegrees),
                      instance.isMirrored ? "true" : "false",
                      instance.sourceIsCountable ? "true" : "false",
                      instance.localOverridesAllowed ? "true" : "false",
                      instance.needsRepair ? "true" : "false",
                      instance.status,
                      instance.nativeGroupId,
                      instance.createdAt,
                      instance.updatedAt,
                      std::to_string(instance.sourceFrame.originX),
                      std::to_string(instance.sourceFrame.originY),
                      std::to_string(instance.sourceFrame.rotationDegrees),
                      instance.sourceFrame.valid ? "true" : "false",
                      std::to_string(instance.liveFrame.originX),
                      std::to_string(instance.liveFrame.originY),
                      std::to_string(instance.liveFrame.rotationDegrees),
                      instance.liveFrame.valid ? "true" : "false",
                  })
               << "\n";
    }
    for (const auto& member : registry.listAllInstanceMembers()) {
        output << joinRecord({
                      "IM",
                      member.instanceUuid,
                      member.componentId,
                      member.elementGuid,
                      member.elementType,
                      member.role,
                      member.status,
                  })
               << "\n";
    }
    return true;
}

const std::filesystem::path& FileRegistryStorage::registryPath() const
{
    return registryPath_;
}

} // namespace buildsync
