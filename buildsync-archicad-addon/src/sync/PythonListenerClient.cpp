#include "sync/PythonListenerClient.hpp"

#include "sync/SyncQueue.hpp"

namespace buildsync {

SyncQueueFlusher::SyncQueueFlusher(PythonListenerClient& client)
    : client_(client)
{
}

bool SyncQueueFlusher::flush(SyncQueue& queue, const std::string& attemptedAt)
{
    if (!client_.healthCheck()) {
        return false;
    }

    bool allSent = true;
    for (const auto& event : queue.listPending()) {
        std::string error;
        if (client_.postEvent(event, error)) {
            queue.markSent(event.eventId, attemptedAt);
        } else {
            queue.markFailed(event.eventId, error, attemptedAt);
            allSent = false;
        }
    }
    return allSent;
}

} // namespace buildsync
