#include "core/AssemblyGraph.hpp"

namespace buildsync {

bool AssemblyGraph::addRelationship(const std::string& parentUuid, const std::string& childUuid, const std::string&)
{
    if (parentUuid.empty() || childUuid.empty() || parentUuid == childUuid || detectCycle(parentUuid, childUuid)) {
        return false;
    }
    childrenByParent_[parentUuid].insert(childUuid);
    parentsByChild_[childUuid].insert(parentUuid);
    return true;
}

bool AssemblyGraph::removeRelationship(const std::string& parentUuid, const std::string& childUuid)
{
    auto children = childrenByParent_.find(parentUuid);
    if (children != childrenByParent_.end()) {
        children->second.erase(childUuid);
    }
    auto parents = parentsByChild_.find(childUuid);
    if (parents != parentsByChild_.end()) {
        parents->second.erase(parentUuid);
    }
    return true;
}

bool AssemblyGraph::detectCycle(const std::string& parentUuid, const std::string& childUuid) const
{
    std::unordered_set<std::string> visited;
    return canReach(childUuid, parentUuid, visited);
}

std::vector<std::string> AssemblyGraph::getChildren(const std::string& parentUuid) const
{
    const auto found = childrenByParent_.find(parentUuid);
    if (found == childrenByParent_.end()) {
        return {};
    }
    return {found->second.begin(), found->second.end()};
}

std::vector<std::string> AssemblyGraph::getParents(const std::string& childUuid) const
{
    const auto found = parentsByChild_.find(childUuid);
    if (found == parentsByChild_.end()) {
        return {};
    }
    return {found->second.begin(), found->second.end()};
}

bool AssemblyGraph::canReach(const std::string& startUuid, const std::string& targetUuid, std::unordered_set<std::string>& visited) const
{
    if (startUuid == targetUuid) {
        return true;
    }
    if (!visited.insert(startUuid).second) {
        return false;
    }
    const auto children = childrenByParent_.find(startUuid);
    if (children == childrenByParent_.end()) {
        return false;
    }
    for (const auto& child : children->second) {
        if (canReach(child, targetUuid, visited)) {
            return true;
        }
    }
    return false;
}

} // namespace buildsync
