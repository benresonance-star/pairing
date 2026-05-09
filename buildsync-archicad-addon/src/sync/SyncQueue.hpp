#pragma once

#include "sync/SyncEvent.hpp"

#include <optional>
#include <string>
#include <vector>

namespace buildsync {

class SyncQueue {
public:
    void enqueue(const SyncEvent& event);
    std::vector<SyncEvent> listPending() const;
    std::optional<SyncEvent> nextPending() const;
    bool markSent(const std::string& eventId, const std::string& attemptedAt = {});
    bool markFailed(const std::string& eventId, const std::string& error, const std::string& attemptedAt = {});

private:
    std::vector<SyncEvent> events_;
};

} // namespace buildsync
