#include "core/AssemblyGraph.hpp"
#include "core/AssemblyRegistry.hpp"
#include "core/AssemblyValidator.hpp"
#include "core/NamingRules.hpp"

#include <cassert>
#include <unordered_map>
#include <unordered_set>

using namespace buildsync;

namespace {

Assembly sampleAssembly()
{
    Assembly assembly;
    assembly.assemblyUuid = "uuid-jn-014";
    assembly.assemblyId = "JN-014";
    assembly.name = "Kitchen Island";
    assembly.type = "Joinery";
    assembly.zone = "Apartment 204";
    assembly.level = "L02";
    assembly.trade = "Joinery";
    assembly.taskId = "TASK-240";
    assembly.members = {
        {"uuid-jn-014", "GUID-001", "Slab", "Benchtop", "active", ""},
        {"uuid-jn-014", "GUID-002", "Wall", "Carcass", "active", ""},
    };
    return assembly;
}

} // namespace

int main()
{
    NamingRules naming;
    assert(naming.generateAssemblyId("Joinery") == "J01");
    assert(naming.generateAssemblyId("Unknown") == "ASM-001");
    assert(naming.generateAssemblyId("Joinery", "L02", "A204") == "L02-A204-J02");

    AssemblyRegistry registry;
    Assembly assembly = sampleAssembly();
    assert(registry.createAssembly(assembly));
    assert(!registry.createAssembly(assembly));
    assert(registry.getAssemblyByUuid("uuid-jn-014")->assemblyId == "JN-014");
    assert(registry.getAssemblyByElementGuid("GUID-001")->name == "Kitchen Island");

    assert(registry.addMembers("uuid-jn-014", {{"", "GUID-003", "Object", "Sink", "active", ""}}));
    assert(registry.getAssemblyByUuid("uuid-jn-014")->members.size() == 3);
    assert(registry.incrementVersion("uuid-jn-014"));
    assert(registry.getAssemblyByUuid("uuid-jn-014")->version == 2);
    assert(registry.removeMembers("uuid-jn-014", {"GUID-003"}));
    assert(registry.getAssemblyByUuid("uuid-jn-014")->members.size() == 2);
    assert(registry.deleteAssembly("uuid-jn-014"));
    assert(!registry.containsAssembly("uuid-jn-014"));
    assert(!registry.getAssemblyByElementGuid("GUID-001"));
    assert(registry.createAssembly(assembly));

    AssemblyGraph graph;
    assert(graph.addRelationship("KIT-002", "JN-014"));
    assert(graph.addRelationship("JN-014", "APP-003"));
    assert(graph.detectCycle("APP-003", "KIT-002"));
    assert(!graph.addRelationship("APP-003", "KIT-002"));
    assert(!graph.addRelationship("KIT-999", "APP-003"));
    assert(graph.getChildren("KIT-002").size() == 1);
    assert(graph.getParents("JN-014").size() == 1);
    assert(graph.getParent("APP-003") == "JN-014");
    assert(graph.getDescendants("KIT-002").size() == 2);

    Assembly root;
    root.assemblyUuid = "uuid-kit-002";
    root.assemblyId = "KIT-002";
    root.name = "Kitchen Assembly";
    AssemblyRegistry treeRegistry;
    assert(treeRegistry.createAssembly(root));

    Assembly branch = sampleAssembly();
    assert(treeRegistry.createAssembly(branch));
    Assembly child = sampleAssembly();
    child.assemblyUuid = "uuid-app-003";
    child.assemblyId = "APP-003";
    child.name = "Appliance Set";
    child.members = {{"uuid-app-003", "GUID-004", "Object", "Appliance", "active", ""}};
    assert(treeRegistry.createAssembly(child));
    assert(treeRegistry.addChildWrapper("uuid-kit-002", "uuid-jn-014"));
    assert(treeRegistry.addChildWrapper("uuid-jn-014", "uuid-app-003"));
    assert(!treeRegistry.addChildWrapper("uuid-kit-002", "uuid-app-003"));
    assert(!treeRegistry.addChildWrapper("uuid-app-003", "uuid-kit-002"));
    assert(treeRegistry.listChildWrappers("uuid-kit-002").size() == 1);
    assert(treeRegistry.listDescendantWrappers("uuid-kit-002").size() == 2);
    assert(treeRegistry.resolveEffectiveMembers("uuid-kit-002").size() == 3);
    assert(treeRegistry.removeChildWrapper("uuid-jn-014", "uuid-app-003"));
    assert(!treeRegistry.getParentWrapper("uuid-app-003"));

    std::unordered_set<std::string> live = {"GUID-001"};
    std::unordered_map<std::string, ElementAssemblyProperties> props = {
        {"GUID-001", {"uuid-jn-014", "JN-014", "Kitchen Island", "Joinery", "Benchtop", "1", "TASK-240", "Joinery", "active"}},
        {"GUID-999", {"missing-registry", "JN-999", "Orphan", "Joinery", "", "1", "", "Joinery", "active"}},
    };
    ValidationResult result = AssemblyValidator::validateAllAssemblies(registry, live, props);
    assert(result.status == "warning");
    assert(result.issues.size() >= 2);

    return 0;
}
