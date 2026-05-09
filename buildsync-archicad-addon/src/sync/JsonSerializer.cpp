#include "sync/JsonSerializer.hpp"

#include <sstream>

namespace buildsync {
namespace {

template <typename T>
std::string arrayJson(const std::vector<T>& values, std::string (*serializer)(const T&))
{
    std::ostringstream out;
    out << "[";
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (i > 0) {
            out << ",";
        }
        out << serializer(values[i]);
    }
    out << "]";
    return out.str();
}

} // namespace

std::string JsonSerializer::assemblyCreated(const std::string& projectId, const Assembly& assembly)
{
    std::ostringstream out;
    out << "{\"event_type\":\"assembly_created\",";
    out << "\"project_id\":\"" << escape(projectId) << "\",";
    out << "\"assembly\":" << assemblyJson(assembly) << ",";
    out << "\"members\":" << arrayJson<AssemblyMember>(assembly.members, memberJson) << "}";
    return out.str();
}

std::string JsonSerializer::assemblyUpdated(
    const std::string& projectId,
    const Assembly& assembly,
    const std::vector<AssemblyMember>& membersAdded,
    const std::vector<AssemblyMember>& membersRemoved)
{
    std::ostringstream out;
    out << "{\"event_type\":\"assembly_updated\",";
    out << "\"project_id\":\"" << escape(projectId) << "\",";
    out << "\"assembly_uuid\":\"" << escape(assembly.assemblyUuid) << "\",";
    out << "\"version\":" << assembly.version << ",";
    out << "\"members_added\":" << arrayJson<AssemblyMember>(membersAdded, memberJson) << ",";
    out << "\"members_removed\":" << arrayJson<AssemblyMember>(membersRemoved, memberJson) << ",";
    out << "\"members_current\":" << arrayJson<AssemblyMember>(assembly.members, memberJson) << "}";
    return out.str();
}

std::string JsonSerializer::assemblyValidated(const std::string& projectId, const Assembly& assembly, const ValidationResult& result)
{
    std::ostringstream out;
    out << "{\"event_type\":\"assembly_validated\",";
    out << "\"project_id\":\"" << escape(projectId) << "\",";
    out << "\"assembly_uuid\":\"" << escape(assembly.assemblyUuid) << "\",";
    out << "\"result\":{\"status\":\"" << escape(result.status) << "\",\"issues\":[";
    for (std::size_t i = 0; i < result.issues.size(); ++i) {
        const auto& issue = result.issues[i];
        if (i > 0) {
            out << ",";
        }
        out << "{\"code\":\"" << escape(issue.code) << "\",";
        out << "\"severity\":\"" << escape(issue.severity) << "\",";
        out << "\"message\":\"" << escape(issue.message) << "\",";
        out << "\"element_guid\":\"" << escape(issue.elementGuid) << "\"}";
    }
    out << "]}}";
    return out.str();
}

std::string JsonSerializer::escape(const std::string& value)
{
    std::ostringstream out;
    for (char ch : value) {
        if (ch == '\\' || ch == '"') {
            out << '\\';
        }
        if (ch == '\n') {
            out << "\\n";
        } else {
            out << ch;
        }
    }
    return out.str();
}

std::string JsonSerializer::memberJson(const AssemblyMember& member)
{
    std::ostringstream out;
    out << "{\"assembly_uuid\":\"" << escape(member.assemblyUuid) << "\",";
    out << "\"element_guid\":\"" << escape(member.elementGuid) << "\",";
    out << "\"element_type\":\"" << escape(member.elementType) << "\",";
    out << "\"role\":\"" << escape(member.role) << "\",";
    out << "\"member_status\":\"" << escape(member.status) << "\"}";
    return out.str();
}

std::string JsonSerializer::assemblyJson(const Assembly& assembly)
{
    std::ostringstream out;
    out << "{\"assembly_uuid\":\"" << escape(assembly.assemblyUuid) << "\",";
    out << "\"assembly_id\":\"" << escape(assembly.assemblyId) << "\",";
    out << "\"name\":\"" << escape(assembly.name) << "\",";
    out << "\"type\":\"" << escape(assembly.type) << "\",";
    out << "\"zone\":\"" << escape(assembly.zone) << "\",";
    out << "\"level\":\"" << escape(assembly.level) << "\",";
    out << "\"trade\":\"" << escape(assembly.trade) << "\",";
    out << "\"task_id\":\"" << escape(assembly.taskId) << "\",";
    out << "\"version\":" << assembly.version << ",";
    out << "\"status\":\"" << escape(assembly.status) << "\"}";
    return out.str();
}

} // namespace buildsync
