#pragma once

#include <string>
#include <unordered_map>

namespace buildsync {

class NamingRules {
public:
    NamingRules();

    void setPrefixForType(const std::string& type, const std::string& prefix);
    std::string getPrefixForType(const std::string& type) const;
    std::string reserveNextSequence(const std::string& prefix);
    std::string generateAssemblyId(const std::string& type, const std::string& level = {}, const std::string& zone = {});

private:
    std::unordered_map<std::string, std::string> prefixesByType_;
    std::unordered_map<std::string, int> nextSequenceByPrefix_;
};

} // namespace buildsync
