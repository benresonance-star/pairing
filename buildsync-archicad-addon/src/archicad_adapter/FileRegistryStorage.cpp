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
    if (!std::getline(input, line) || line != "BuildSyncRegistry\t1") {
        return false;
    }

    std::unordered_map<std::string, Assembly> assembliesByUuid;
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
        }
    }

    for (const auto& [_, assembly] : assembliesByUuid) {
        if (!registry.createAssembly(assembly)) {
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

    output << "BuildSyncRegistry\t1\n";
    for (const auto& assembly : registry.listAssemblies()) {
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
    return true;
}

const std::filesystem::path& FileRegistryStorage::registryPath() const
{
    return registryPath_;
}

} // namespace buildsync
