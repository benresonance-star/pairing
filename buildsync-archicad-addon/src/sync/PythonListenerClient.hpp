#pragma once

#include "sync/SyncEvent.hpp"

#include <string>
#include <vector>

namespace buildsync {

class PythonListenerClient {
public:
    virtual ~PythonListenerClient() = default;
    virtual bool healthCheck() = 0;
    virtual bool postEvent(const SyncEvent& event, std::string& errorMessage) = 0;
};

class SyncQueueFlusher {
public:
    SyncQueueFlusher(PythonListenerClient& client);

    bool flush(class SyncQueue& queue, const std::string& attemptedAt = {});

private:
    PythonListenerClient& client_;
};

} // namespace buildsync
