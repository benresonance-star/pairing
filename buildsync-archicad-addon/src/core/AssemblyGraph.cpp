#include "core/AssemblyGraph.hpp"

namespace buildsync {

bool AssemblyGraph::addRelationship(const std::string& parentUuid, const std::string& childUuid, const std::string&)
{
    if (parentUuid.empty() || childUuid.empty() || parentUuid == childUuid || detectCycle(parentUuid, childUuid)) {
        return false;
    }
    const auto existingParent = parentByChild_.find(childUuid);
    if (existingParent != parentByChild_.end() && existingParent->second != parentUuid) {
        return false;
    }
    childrenByParent_[parentUuid].insert(childUuid);
    parentByChild_[childUuid] = parentUuid;
    return true;
}

bool AssemblyGraph::removeRelationship(const std::string& parentUuid, const std::string& childUuid)
{
    auto children = childrenByParent_.find(parentUuid);
    if (children != childrenByParent_.end()) {
        children->second.erase(childUuid);
    }
    auto parent = parentByChild_.find(childUuid);
    if (parent != parentByChild_.end() && parent->second == parentUuid) {
        parentByChild_.erase(parent);
    }
    return true;
}

bool AssemblyGraph::detectCycle(const std::string& parentUuid, const std::string& childUuid) const
{
    std::unordered_set<std::string> visited;
    return canReach(childUuid, parentUuid, visited);
}

std::optional<std::string> AssemblyGraph::getParent(const std::string& childUuid) const
{
    const auto found = parentByChild_.find(childUuid);
    if (found == parentByChild_.end()) {
        return std::nullopt;
    }
    return found->second;
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
    const auto parent = getParent(childUuid);
    if (!parent) {
        return {};
    }
    return {*parent};
}

std::vector<std::string> AssemblyGraph::getDescendants(const std::string& rootUuid) const
{
    std::unordered_set<std::string> visited;
    std::vector<std::string> descendants;
    collectDescendants(rootUuid, visited, descendants);
    return descendants;
}

void AssemblyGraph::clear()
{
    childrenByParent_.clear();
    parentByChild_.clear();
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

void AssemblyGraph::collectDescendants(const std::string& rootUuid, std::unordered_set<std::string>& visited, std::vector<std::string>& descendants) const
{
    if (!visited.insert(rootUuid).second) {
        return;
    }
    const auto children = childrenByParent_.find(rootUuid);
    if (children == childrenByParent_.end()) {
        return;
    }
    for (const auto& child : children->second) {
        descendants.push_back(child);
        collectDescendants(child, visited, descendants);
    }
}

} // namespace buildsync
