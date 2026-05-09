#include "core/Assembly.hpp"
#include "core/AssemblyValidator.hpp"
#include "sync/JsonSerializer.hpp"
#include "sync/SyncQueue.hpp"

#include <cassert>

using namespace buildsync;

int main()
{
    Assembly assembly;
    assembly.assemblyUuid = "uuid-jn-014";
    assembly.assemblyId = "JN-014";
    assembly.name = "Kitchen Island";
    assembly.type = "Joinery";
    assembly.version = 2;
    assembly.members = {{"uuid-jn-014", "GUID-001", "Slab", "Benchtop", "active", ""}};

    const std::string created = JsonSerializer::assemblyCreated("local-project", assembly);
    assert(created.find("\"event_type\":\"assembly_created\"") != std::string::npos);
    assert(created.find("\"assembly_id\":\"JN-014\"") != std::string::npos);
    assert(created.find("\"element_guid\":\"GUID-001\"") != std::string::npos);

    ValidationResult validation;
    validation.status = "warning";
    validation.issues.push_back({"MISSING_MEMBER", "warning", "Stored member no longer exists.", "uuid-jn-014", "GUID-002"});
    const std::string validated = JsonSerializer::assemblyValidated("local-project", assembly, validation);
    assert(validated.find("\"event_type\":\"assembly_validated\"") != std::string::npos);
    assert(validated.find("\"code\":\"MISSING_MEMBER\"") != std::string::npos);

    SyncQueue queue;
    queue.enqueue({"evt-1", "assembly_created", "2026-05-09T10:00:00+10:00", created, "pending", 0, ""});
    queue.enqueue({"evt-2", "assembly_updated", "2026-05-09T10:01:00+10:00", "{}", "pending", 0, ""});
    assert(queue.listPending().size() == 2);
    assert(queue.nextPending()->eventId == "evt-1");
    assert(queue.markFailed("evt-1", "listener offline", "later"));
    assert(queue.nextPending()->eventId == "evt-1");
    assert(queue.markSent("evt-1", "later"));
    assert(queue.nextPending()->eventId == "evt-2");

    return 0;
}
