#pragma once

#include <string>

namespace buildsync {

struct SyncEvent {
    std::string eventId;
    std::string eventType;
    std::string createdAt;
    std::string payloadJson;
    std::string syncStatus{"pending"};
    int attemptCount{0};
    std::string lastAttemptAt;
};

} // namespace buildsync
