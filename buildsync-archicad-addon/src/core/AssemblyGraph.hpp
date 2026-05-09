#pragma once

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
    std::vector<std::string> getChildren(const std::string& parentUuid) const;
    std::vector<std::string> getParents(const std::string& childUuid) const;

private:
    bool canReach(const std::string& startUuid, const std::string& targetUuid, std::unordered_set<std::string>& visited) const;

    std::unordered_map<std::string, std::unordered_set<std::string>> childrenByParent_;
    std::unordered_map<std::string, std::unordered_set<std::string>> parentsByChild_;
};

} // namespace buildsync
