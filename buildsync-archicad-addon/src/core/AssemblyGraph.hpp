#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace buildsync {

class AssemblyGraph {
public:
    bool addRelationship(const std::string& parentUuid, const std::string& childUuid, const std::string& relationshipType = "contains");
    bool removeRelationship(const std::string& parentUuid, const std::string& childUuid);
    bool detectCycle(const std::string& parentUuid, const std::string& childUuid) const;
    std::optional<std::string> getParent(const std::string& childUuid) const;
    std::vector<std::string> getChildren(const std::string& parentUuid) const;
    std::vector<std::string> getParents(const std::string& childUuid) const;
    std::vector<std::string> getDescendants(const std::string& rootUuid) const;
    void clear();

private:
    bool canReach(const std::string& startUuid, const std::string& targetUuid, std::unordered_set<std::string>& visited) const;
    void collectDescendants(const std::string& rootUuid, std::unordered_set<std::string>& visited, std::vector<std::string>& descendants) const;

    std::unordered_map<std::string, std::unordered_set<std::string>> childrenByParent_;
    std::unordered_map<std::string, std::string> parentByChild_;
};

} // namespace buildsync
