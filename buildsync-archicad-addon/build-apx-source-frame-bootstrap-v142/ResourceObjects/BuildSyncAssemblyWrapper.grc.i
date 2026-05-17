


'STR#' 32000 "Add-on Name and Description" {
        "BuildSync Assembly Wrapper"
        "Creates construction wrappers from selected Archicad elements."
}

'STR#' 32500 "BuildSync Menu Strings" {
        "BuildSync"
        "Assemblies"
            "Create Joinery Wrapper from Selection^ES^EE^EI^E3^EL"
            "Select Wrapper Members^ES^EE^EI^E3^EL"
            "Add Selection to Wrapper^ES^EE^EI^E3^EL"
            "Remove Selection from Wrapper^ES^EE^EI^E3^EL"
            "Validate Selected Wrapper^ES^EE^EI^E3^EL"
            "Sync Wrapper Events^ES^EE^EI^E3^EL"
            "Debug Selection^ES^EE^EI^E3^EL"
            "Debug Registry^ES^EE^EI^E3^EL"
            "Debug BuildSync Properties^ES^EE^EI^E3^EL"
            "Manage Wrappers...^ES^EE^EI^E3^EL"
            "Place Wrapper Instance (Supported: Wall, Slab, Column, Beam, Roof, Object)^ES^EE^EI^E3^EL"
            "Place Mirrored Wrapper Instance^ES^EE^EI^E3^EL"
            "Select Wrapper Instance^ES^EE^EI^E3^EL"
            "Enter Shared Wrapper Edit Mode^ES^EE^EI^E3^EL"
            "Apply Shared Wrapper Edit^ES^EE^EI^E3^EL"
            "Cancel Shared Wrapper Edit^ES^EE^EI^E3^EL"
            "Convert Instance to Standalone Wrapper^ES^EE^EI^E3^EL"
            "Break Apart Wrapper Instance^ES^EE^EI^E3^EL"
            "Repair Wrapper Instance^ES^EE^EI^E3^EL"
}

'STR#' 32600 "BuildSync Menu Prompt Strings" {
        "Create a BuildSync joinery wrapper from the selected Archicad elements."
        "Select all live Archicad elements in the selected BuildSync wrapper."
        "Add selected Archicad elements to the selected BuildSync wrapper."
        "Remove selected Archicad elements from their BuildSync wrapper."
        "Validate the selected BuildSync wrapper against live model elements."
        "Send pending BuildSync wrapper events to the local listener."
        "Print selected element GUIDs and element types to the Session Report."
        "Print the local BuildSync wrapper registry to the Session Report."
        "Print BuildSync property diagnostics for selected elements."
        "Open the BuildSync wrapper manager dialog."
        "Place a physical/countable wrapper instance. MVP supports only walls, slabs, columns, beams, roofs, and objects."
        "Place a mirrored physical/countable wrapper instance and flag it for scheduling."
        "Select all members of the wrapper instance containing the selected element."
        "Enter shared-master wrapper edit mode. Local overrides are not allowed; convert to standalone first for independent edits."
        "Apply reviewed shared-master edits to the source wrapper and every linked instance."
        "Cancel the active shared-master wrapper edit session."
        "Convert the selected instance into a standalone physical/countable wrapper."
        "Break apart the selected instance into unbound Archicad elements."
        "Repair metadata and grouping for the selected wrapper instance."
}

'GDLG' 32700 Palette | topCaption | close | grow 40 0 640 760 "BuildSync Wrapper Manager" {
 Button             555  728   70   24     LargePlain  "Close"
 SingleSelList       12   32  260  250     SmallPlain  NoPartialItems  16
 LeftText            12   10  120   18     SmallPlain  vCenter  "Wrappers"
 Button              12  292  120   24     LargePlain  "Create from Selection"
 Button             140  292   85   24     LargePlain  "Delete"
 Button              12  322  120   24     LargePlain  "Select Members"
 Button             140  322  120   24     LargePlain  "Add Selection"
 Button              12  352  120   24     LargePlain  "Remove Selection"
 Button             140  352  120   24     LargePlain  "Repair Registry"
 Button             292  382   95   24     LargePlain  "Place Instance"
 Button             392  382   95   24     LargePlain  "Select Inst."
 Button             492  382   70   24     LargePlain  "Enter Edit"
 Button             292  412   95   24     LargePlain  "Apply Edit"
 Button             392  412   95   24     LargePlain  "Cancel Edit"
 LeftText           292   10  120   18     SmallPlain  vCenter  "Wrapper Details"
 LeftText           292   42   65   18     SmallPlain  vCenter  "ID"
 TextEdit           365   40  240   22     SmallPlain  255
 LeftText           292   72   65   18     SmallPlain  vCenter  "Name"
 TextEdit           365   70  240   22     SmallPlain  255
 LeftText           292  102   65   18     SmallPlain  vCenter  "Type"
 TextEdit           365  100  240   22     SmallPlain  255
 LeftText           292  132   65   18     SmallPlain  vCenter  "Zone"
 TextEdit           365  130  240   22     SmallPlain  255
 LeftText           292  162   65   18     SmallPlain  vCenter  "Level"
 TextEdit           365  160  240   22     SmallPlain  255
 LeftText           292  192   65   18     SmallPlain  vCenter  "Trade"
 TextEdit           365  190  240   22     SmallPlain  255
 LeftText           292  222   65   18     SmallPlain  vCenter  "Task ID"
 TextEdit           365  220  240   22     SmallPlain  255
 LeftText           292  252   65   18     SmallPlain  vCenter  "Status"
 TextEdit           365  250  240   22     SmallPlain  255
 Button             365  282  100   24     LargePlain  "Save Details"
 LeftText           292  322   65   18     SmallPlain  vCenter  "Prop Key"
 TextEdit           365  320  115   22     SmallPlain  255
 LeftText           292  352   65   18     SmallPlain  vCenter  "Prop Value"
 TextEdit           365  350  240   22     SmallPlain  255
 Button             490  320   55   24     LargePlain  "Set"
 Button             550  320   70   24     LargePlain  "Remove"
 LeftText            12  398  520   24     SmallPlain  vCenter  ""
 Button              12  382   85   24     LargePlain  "Refresh"
 Button             638  758    1    1     LargePlain  ""
 LeftText            12  440   80   18     SmallPlain  vCenter  "Members"
 Button             100  436  110   24     LargePlain  "Show Members"
 SingleSelList       12  588  608  132     SmallPlain  NoPartialItems  16  HasHeader  18
 LeftText            12  468  100   18     SmallPlain  vCenter  "Sub-Wrappers"
 SingleSelList       12  492  380   72     SmallPlain  NoPartialItems  16
 Button             405  492  105   24     LargePlain  "Add Selected"
 Button             515  492  105   24     LargePlain  "Remove Child"
 Button             405  522  140   24     LargePlain  "Select Branch"
}

'DLGH' 32700 DLG_32700_BuildSync_Wrapper_Manager {
1   ""                          Button_0
2   ""                          SingleSelListBox_0
3   ""                          LeftText_0
4   ""                          Button_1
5   ""                          Button_2
6   ""                          Button_3
7   ""                          Button_4
8   ""                          Button_5
9   ""                          Button_6
10  ""                          LeftText_1
11  ""                          LeftText_2
12  ""                          TextEdit_0
13  ""                          LeftText_3
14  ""                          TextEdit_1
15  ""                          LeftText_4
16  ""                          TextEdit_2
17  ""                          LeftText_5
18  ""                          TextEdit_3
19  ""                          LeftText_6
20  ""                          TextEdit_4
21  ""                          LeftText_7
22  ""                          TextEdit_5
23  ""                          LeftText_8
24  ""                          TextEdit_6
25  ""                          LeftText_9
26  ""                          TextEdit_7
27  ""                          Button_7
28  ""                          LeftText_10
29  ""                          TextEdit_8
30  ""                          LeftText_11
31  ""                          TextEdit_9
32  ""                          Button_8
33  ""                          Button_9
34  ""                          LeftText_12
35  ""                          Button_10
36  ""                          Button_11
37  ""                          LeftText_13
38  ""                          Button_12
39  ""                          SingleSelListBox_1
40  ""                          LeftText_14
41  ""                          SingleSelListBox_2
42  ""                          Button_13
43  ""                          Button_14
44  ""                          Button_15
45  ""                          Button_16
46  ""                          Button_17
47  ""                          Button_18
48  ""                          Button_19
49  ""                          Button_20
}
