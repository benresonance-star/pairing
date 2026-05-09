#include "sync/SyncQueue.hpp"

namespace buildsync {

void SyncQueue::enqueue(const SyncEvent& event)
{
    events_.push_back(event);
}

std::vector<SyncEvent> SyncQueue::listPending() const
{
    std::vector<SyncEvent> pending;
    for (const auto& event : events_) {
        if (event.syncStatus == "pending" || event.syncStatus == "failed") {
            pending.push_back(event);
        }
    }
    return pending;
}

std::optional<SyncEvent> SyncQueue::nextPending() const
{
    for (const auto& event : events_) {
        if (event.syncStatus == "pending" || event.syncStatus == "failed") {
            return event;
        }
    }
    return std::nullopt;
}

bool SyncQueue::markSent(const std::string& eventId, const std::string& attemptedAt)
{
    for (auto& event : events_) {
        if (event.eventId == eventId) {
            event.syncStatus = "sent";
            event.lastAttemptAt = attemptedAt;
            return true;
        }
    }
    return false;
}

bool SyncQueue::markFailed(const std::string& eventId, const std::string&, const std::string& attemptedAt)
{
    for (auto& event : events_) {
        if (event.eventId == eventId) {
            event.syncStatus = "failed";
            ++event.attemptCount;
            event.lastAttemptAt = attemptedAt;
            return true;
        }
    }
    return false;
}

} // namespace buildsync
