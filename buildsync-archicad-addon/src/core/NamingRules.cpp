#include "core/NamingRules.hpp"

#include <algorithm>
#include <cctype>
#include <iomanip>
#include <sstream>

namespace buildsync {
namespace {

std::string lower(std::string value)
{
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });
    return value;
}

std::string upper(std::string value)
{
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::toupper(ch));
    });
    return value;
}

} // namespace

NamingRules::NamingRules()
    : prefixesByType_{
        {"joinery", "J"},
        {"kitchen", "KIT"},
        {"bathroom", "BTH"},
        {"facade", "FCD"},
        {"façade", "FCD"},
        {"structure", "STR"},
        {"services", "SVC"},
    }
{
}

void NamingRules::setPrefixForType(const std::string& type, const std::string& prefix)
{
    prefixesByType_[lower(type)] = upper(prefix);
}

std::string NamingRules::getPrefixForType(const std::string& type) const
{
    const auto found = prefixesByType_.find(lower(type));
    if (found == prefixesByType_.end() || found->second.empty()) {
        return "ASM";
    }
    return found->second;
}

std::string NamingRules::reserveNextSequence(const std::string& prefix)
{
    const std::string normalizedPrefix = upper(prefix.empty() ? "ASM" : prefix);
    int& next = nextSequenceByPrefix_[normalizedPrefix];
    if (next <= 0) {
        next = 1;
    }

    std::ostringstream id;
    if (normalizedPrefix.size() == 1) {
        id << normalizedPrefix << std::setw(2) << std::setfill('0') << next;
    } else {
        id << normalizedPrefix << "-" << std::setw(3) << std::setfill('0') << next;
    }
    ++next;
    return id.str();
}

std::string NamingRules::generateAssemblyId(const std::string& type, const std::string& level, const std::string& zone)
{
    const std::string base = reserveNextSequence(getPrefixForType(type));
    if (level.empty() || zone.empty()) {
        return base;
    }
    return level + "-" + zone + "-" + base;
}

} // namespace buildsync
