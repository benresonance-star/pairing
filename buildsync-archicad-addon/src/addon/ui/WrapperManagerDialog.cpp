#include "addon/ui/WrapperManagerDialog.hpp"

#include "APIEnvir.h"
#include "ACAPinc.h"
#include "DGModule.hpp"
#include "addon/ResourceIds.hpp"

#include <algorithm>
#include <cctype>
#include <memory>
#include <sstream>
#include <optional>
#include <string>
#include <vector>

namespace buildsync {
namespace {

const GS::Guid WrapperManagerPaletteGuid("{84F9D87D-916E-4B32-AD1B-384F612C4D2D}");

std::string toStdString(const GS::UniString& value)
{
    return value.ToCStr().Get();
}

GS::UniString toUniString(const std::string& value)
{
    return GS::UniString(value.c_str());
}

std::string errorCodeString(::GSErrCode error)
{
    std::ostringstream out;
    out << error;
    return out.str();
}

class WrapperManagerDialog final : public DG::Palette,
                                   public DG::PanelObserver,
                                   public DG::CompoundItemObserver,
                                   public DG::ButtonItemObserver,
                                   public DG::ListBoxObserver {
public:
    explicit WrapperManagerDialog(NativeRuntime& runtime)
        : DG::Palette(ACAPI_GetOwnResModule(), WrapperManagerDialogResourceId, InvalidResModule, WrapperManagerPaletteGuid)
        , closeButton(GetReference(), CloseButtonId)
        , wrapperList(GetReference(), WrapperListId)
        , createButton(GetReference(), CreateButtonId)
        , deleteButton(GetReference(), DeleteButtonId)
        , selectMembersButton(GetReference(), SelectMembersButtonId)
        , addSelectionButton(GetReference(), AddSelectionButtonId)
        , removeSelectionButton(GetReference(), RemoveSelectionButtonId)
        , repairButton(GetReference(), RepairButtonId)
        , idEdit(GetReference(), IdEditId)
        , nameEdit(GetReference(), NameEditId)
        , typeEdit(GetReference(), TypeEditId)
        , zoneEdit(GetReference(), ZoneEditId)
        , levelEdit(GetReference(), LevelEditId)
        , tradeEdit(GetReference(), TradeEditId)
        , taskIdEdit(GetReference(), TaskIdEditId)
        , statusEdit(GetReference(), StatusEditId)
        , saveButton(GetReference(), SaveButtonId)
        , propertyKeyEdit(GetReference(), PropertyKeyEditId)
        , propertyValueEdit(GetReference(), PropertyValueEditId)
        , setPropertyButton(GetReference(), SetPropertyButtonId)
        , removePropertyButton(GetReference(), RemovePropertyButtonId)
        , messageText(GetReference(), MessageTextId)
        , refreshButton(GetReference(), RefreshButtonId)
        , selectBehindButton(GetReference(), SelectBehindButtonId)
        , membersHeaderText(GetReference(), MembersHeaderTextId)
        , membersToggleButton(GetReference(), MembersToggleButtonId)
        , memberList(GetReference(), MemberListId)
        , runtime_(runtime)
    {
        Attach(*this);
        AttachToAllItems(*this);
        wrapperList.Attach(*this);
        wrapperList.SetTabFieldCount(1);
        wrapperList.SetTabFieldProperties(1, 0, 250, DG::ListBox::Left, DG::ListBox::EndTruncate, false, true);
        memberList.Attach(*this);
        memberList.SetTabFieldCount(3);
        ConfigureMemberListHeader();
        ConfigureMemberListTabs();
        UpdateMemberSectionVisibility();
        BeginEventProcessing();
        RefreshWrappers("");
    }

    ~WrapperManagerDialog()
    {
        EndEventProcessing();
        DetachFromAllItems(*this);
        Detach(*this);
    }

    void Show()
    {
        RefreshWrappers(SelectedUuid());
        DG::Palette::Show();
        BringToFront();
    }

    void Hide()
    {
        DG::Palette::Hide();
    }

    void ButtonClicked(const DG::ButtonClickEvent& event) override
    {
        if (event.GetSource() == &closeButton) {
            Hide();
        } else if (event.GetSource() == &createButton) {
            CreateWrapper();
        } else if (event.GetSource() == &deleteButton) {
            DeleteWrapper();
        } else if (event.GetSource() == &selectMembersButton) {
            SelectMembers(false);
        } else if (event.GetSource() == &addSelectionButton) {
            AddSelection();
        } else if (event.GetSource() == &removeSelectionButton) {
            RunMutation("BuildSync Remove Selection", [&]() {
                return runtime_.commandService().removeSelectionFromAssembly();
            });
        } else if (event.GetSource() == &repairButton) {
            RunMutation("BuildSync Repair Registry", [&]() {
                return runtime_.commandService().repairRegistry();
            });
        } else if (event.GetSource() == &saveButton) {
            SaveDetails();
        } else if (event.GetSource() == &setPropertyButton) {
            SetCustomProperty();
        } else if (event.GetSource() == &removePropertyButton) {
            RemoveCustomProperty();
        } else if (event.GetSource() == &refreshButton) {
            RefreshWrappers(SelectedUuid());
            messageText.SetText("BuildSync: Wrapper list refreshed.");
        } else if (event.GetSource() == &selectBehindButton) {
            SelectMembers(true);
        } else if (event.GetSource() == &membersToggleButton) {
            ToggleMemberSection();
        }
    }

    void ListBoxSelectionChanged(const DG::ListBoxSelectionEvent& event) override
    {
        if (event.GetSource() == &wrapperList) {
            LoadSelectedWrapper();
        }
    }

    void ListBoxDoubleClicked(const DG::ListBoxDoubleClickEvent& event) override
    {
        if (event.GetSource() == &memberList) {
            SelectMemberFromList();
        }
    }

    void ListBoxHeaderItemClicked(const DG::ListBoxHeaderItemClickEvent& event) override
    {
        if (event.GetSource() != &memberList) {
            return;
        }

        const short column = event.GetHeaderItem();
        if (column < MemberSortTypeColumn || column > MemberSortLayerColumn) {
            return;
        }
        if (memberSortColumn_ == column) {
            memberSortAscending_ = !memberSortAscending_;
        } else {
            memberSortColumn_ = column;
            memberSortAscending_ = true;
        }
        ApplyMemberSort();
        RenderMemberListRows();
    }

    void PanelCloseRequested(const DG::PanelCloseRequestEvent&, bool* accepted) override
    {
        Hide();
        *accepted = true;
    }

    void PanelActivated(const DG::PanelActivateEvent&) override
    {
        RefreshWrappers(SelectedUuid());
    }

    void PanelResized(const DG::PanelResizeEvent&) override
    {
        if (membersExpanded_) {
            expandedClientHeight_ = GetClientHeight();
        }
        LayoutMemberSection();
    }

private:
    enum {
        CloseButtonId = 1,
        WrapperListId = 2,
        CreateButtonId = 4,
        DeleteButtonId = 5,
        SelectMembersButtonId = 6,
        AddSelectionButtonId = 7,
        RemoveSelectionButtonId = 8,
        RepairButtonId = 9,
        IdEditId = 12,
        NameEditId = 14,
        TypeEditId = 16,
        ZoneEditId = 18,
        LevelEditId = 20,
        TradeEditId = 22,
        TaskIdEditId = 24,
        StatusEditId = 26,
        SaveButtonId = 27,
        PropertyKeyEditId = 29,
        PropertyValueEditId = 31,
        SetPropertyButtonId = 32,
        RemovePropertyButtonId = 33,
        MessageTextId = 34,
        RefreshButtonId = 35,
        SelectBehindButtonId = 36,
        MembersHeaderTextId = 37,
        MembersToggleButtonId = 38,
        MemberListId = 39,
    };

    static constexpr short CollapsedHeight = 462;
    static constexpr short ExpandedHeight = 662;
    static constexpr short LeftMargin = 12;
    static constexpr short RightMargin = 15;
    static constexpr short CloseButtonWidth = 70;
    static constexpr short CloseButtonHeight = 24;
    static constexpr short CollapsedCloseTop = 398;
    static constexpr short MemberListTop = 468;
    static constexpr short MemberListBottomGap = 8;
    static constexpr short BottomMargin = 8;
    static constexpr short NoMemberSortColumn = 0;
    static constexpr short MemberSortTypeColumn = 1;
    static constexpr short MemberSortElementIdColumn = 2;
    static constexpr short MemberSortLayerColumn = 3;

    DG::Button closeButton;
    DG::SingleSelListBox wrapperList;
    DG::Button createButton;
    DG::Button deleteButton;
    DG::Button selectMembersButton;
    DG::Button addSelectionButton;
    DG::Button removeSelectionButton;
    DG::Button repairButton;
    DG::TextEdit idEdit;
    DG::TextEdit nameEdit;
    DG::TextEdit typeEdit;
    DG::TextEdit zoneEdit;
    DG::TextEdit levelEdit;
    DG::TextEdit tradeEdit;
    DG::TextEdit taskIdEdit;
    DG::TextEdit statusEdit;
    DG::Button saveButton;
    DG::TextEdit propertyKeyEdit;
    DG::TextEdit propertyValueEdit;
    DG::Button setPropertyButton;
    DG::Button removePropertyButton;
    DG::LeftText messageText;
    DG::Button refreshButton;
    DG::Button selectBehindButton;
    DG::LeftText membersHeaderText;
    DG::Button membersToggleButton;
    DG::SingleSelListBox memberList;
    NativeRuntime& runtime_;
    std::vector<Assembly> wrappers_;
    std::vector<ElementMetadata> memberRows_;
    bool membersExpanded_{false};
    short expandedClientHeight_{ExpandedHeight};
    short memberSortColumn_{NoMemberSortColumn};
    bool memberSortAscending_{true};

    std::string SelectedUuid() const
    {
        const short selected = wrapperList.GetSelectedItem();
        if (selected <= 0 || static_cast<std::size_t>(selected) > wrappers_.size()) {
            return "";
        }
        return wrappers_[selected - 1].assemblyUuid;
    }

    void RefreshWrappers(const std::string& preferredUuid)
    {
        wrappers_ = runtime_.commandService().listWrappers();
        wrapperList.DeleteItem(DG::ListBox::AllItems);
        short selectedItem = 0;
        for (const auto& wrapper : wrappers_) {
            wrapperList.AppendItem();
            const short item = wrapperList.GetItemCount();
            const std::string label = wrapper.assemblyId + "  " + wrapper.name + "  members=" + std::to_string(wrapper.members.size());
            wrapperList.SetTabItemText(item, 1, toUniString(label));
            if (wrapper.assemblyUuid == preferredUuid) {
                selectedItem = item;
            }
        }
        if (selectedItem == 0 && !wrappers_.empty()) {
            selectedItem = 1;
        }
        if (selectedItem > 0) {
            wrapperList.SelectItem(selectedItem);
        }
        LoadSelectedWrapper();
    }

    void LoadSelectedWrapper()
    {
        const std::string uuid = SelectedUuid();
        const auto wrapper = uuid.empty() ? std::optional<Assembly>{} : runtime_.commandService().getWrapper(uuid);
        if (!wrapper) {
            idEdit.SetText("");
            nameEdit.SetText("");
            typeEdit.SetText("Joinery");
            zoneEdit.SetText("");
            levelEdit.SetText("");
            tradeEdit.SetText("Joinery");
            taskIdEdit.SetText("");
            statusEdit.SetText("active");
            propertyKeyEdit.SetText("");
            propertyValueEdit.SetText("");
            RefreshMemberList("");
            return;
        }

        idEdit.SetText(toUniString(wrapper->assemblyId));
        nameEdit.SetText(toUniString(wrapper->name));
        typeEdit.SetText(toUniString(wrapper->type));
        zoneEdit.SetText(toUniString(wrapper->zone));
        levelEdit.SetText(toUniString(wrapper->level));
        tradeEdit.SetText(toUniString(wrapper->trade));
        taskIdEdit.SetText(toUniString(wrapper->taskId));
        statusEdit.SetText(toUniString(wrapper->status));
        if (!wrapper->customProperties.empty()) {
            propertyKeyEdit.SetText(toUniString(wrapper->customProperties.front().key));
            propertyValueEdit.SetText(toUniString(wrapper->customProperties.front().value));
        } else {
            propertyKeyEdit.SetText("");
            propertyValueEdit.SetText("");
        }
        RefreshMemberList(wrapper->assemblyUuid);
    }

    AssemblyUpdateRequest CurrentUpdateRequest() const
    {
        return {
            toStdString(idEdit.GetText()),
            toStdString(nameEdit.GetText()),
            toStdString(typeEdit.GetText()),
            toStdString(zoneEdit.GetText()),
            toStdString(levelEdit.GetText()),
            toStdString(tradeEdit.GetText()),
            toStdString(taskIdEdit.GetText()),
            toStdString(statusEdit.GetText()),
        };
    }

    CreateAssemblyRequest CurrentCreateRequest() const
    {
        std::string name = toStdString(nameEdit.GetText());
        std::string type = toStdString(typeEdit.GetText());
        std::string trade = toStdString(tradeEdit.GetText());
        if (name.empty()) {
            name = "Joinery Wrapper";
        }
        if (type.empty()) {
            type = "Joinery";
        }
        if (trade.empty()) {
            trade = type;
        }
        return {
            name,
            type,
            toStdString(zoneEdit.GetText()),
            toStdString(levelEdit.GetText()),
            trade,
            toStdString(taskIdEdit.GetText()),
        };
    }

    std::string SelectedMemberGuid() const
    {
        const short selected = memberList.GetSelectedItem();
        if (selected <= 0 || static_cast<std::size_t>(selected) > memberRows_.size()) {
            return "";
        }
        return memberRows_[selected - 1].elementGuid;
    }

    static GS::UniString displayValue(const std::string& value)
    {
        return toUniString(value.empty() ? "Missing" : value);
    }

    static std::string withoutAsciiWhitespace(std::string value)
    {
        value.erase(
            std::remove_if(value.begin(), value.end(), [](unsigned char ch) {
                return std::isspace(ch) != 0;
            }),
            value.end());
        return value;
    }

    static bool isDefaultLayerGlyph(const std::string& value)
    {
        const std::string compact = withoutAsciiWhitespace(value);
        if (compact.size() == 1) {
            const unsigned char ch = static_cast<unsigned char>(compact.front());
            if (ch < 32 || ch == 127) {
                return true;
            }
        }
        return compact == "\xE2\x96\xA0" || // black square
            compact == "\xE2\x96\xA1" ||    // white square
            compact == "\xE2\x96\xA2" ||    // white square with rounded corners
            compact == "\xE2\x96\xAF" ||    // white vertical rectangle
            compact == "\xE2\x96\xAA" ||    // black small square
            compact == "\xE2\x96\xAB" ||    // white small square
            compact == "\xE2\x97\xBB" ||    // white medium square
            compact == "\xE2\x97\xBC" ||    // black medium square
            compact == "\xE2\x98\x90" ||    // ballot box
            compact == "\xEF\xBF\xBD";      // replacement character
    }

    static std::string displayLayerName(const std::string& value)
    {
        return isDefaultLayerGlyph(value) ? "Archicad Layer" : value;
    }

    static std::string lowerAscii(std::string value)
    {
        std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
            return static_cast<char>(std::tolower(ch));
        });
        return value;
    }

    static std::string memberSortValue(const ElementMetadata& member, short column)
    {
        if (column == MemberSortElementIdColumn) {
            return member.elementId;
        }
        if (column == MemberSortLayerColumn) {
            return displayLayerName(member.layerName);
        }
        return member.elementType;
    }

    void ConfigureMemberListTabs()
    {
        const short listWidth = std::max<short>(memberList.GetWidth(), 320);
        const short layerEnd = std::max<short>(310, listWidth - 18);
        memberList.SetTabFieldProperties(1, 0, 120, DG::ListBox::Left, DG::ListBox::EndTruncate, true, true);
        memberList.SetTabFieldProperties(2, 120, 300, DG::ListBox::Left, DG::ListBox::EndTruncate, true, true);
        memberList.SetTabFieldProperties(3, 300, layerEnd, DG::ListBox::Left, DG::ListBox::EndTruncate, false, true);
        if (memberList.HasHeader()) {
            memberList.SetHeaderItemSize(1, 120);
            memberList.SetHeaderItemSize(2, 180);
            memberList.SetHeaderItemSize(3, std::max<short>(10, layerEnd - 300));
        }
    }

    void ConfigureMemberListHeader()
    {
        if (!memberList.HasHeader()) {
            return;
        }
        memberList.SetHeaderItemCount(3);
        memberList.SetHeaderPushableButtons(true);
        memberList.SetHeaderItemText(1, "Type");
        memberList.SetHeaderItemText(2, "Element ID");
        memberList.SetHeaderItemText(3, "Layer");
        memberList.SetHeaderItemStyle(1, DG::ListBox::Left, DG::ListBox::EndTruncate);
        memberList.SetHeaderItemStyle(2, DG::ListBox::Left, DG::ListBox::EndTruncate);
        memberList.SetHeaderItemStyle(3, DG::ListBox::Left, DG::ListBox::EndTruncate);
        UpdateMemberSortHeader();
    }

    void UpdateMemberSortHeader()
    {
        if (!memberList.HasHeader()) {
            return;
        }
        for (short column = MemberSortTypeColumn; column <= MemberSortLayerColumn; ++column) {
            memberList.SetHeaderItemArrowType(column, DG::ListBox::NoArrow);
        }
        if (memberSortColumn_ != NoMemberSortColumn) {
            memberList.SetHeaderItemArrowType(memberSortColumn_, memberSortAscending_ ? DG::ListBox::Up : DG::ListBox::Down);
        }
    }

    void ApplyMemberSort()
    {
        if (memberSortColumn_ == NoMemberSortColumn) {
            return;
        }
        std::stable_sort(memberRows_.begin(), memberRows_.end(), [&](const ElementMetadata& left, const ElementMetadata& right) {
            const std::string leftRaw = memberSortValue(left, memberSortColumn_);
            const std::string rightRaw = memberSortValue(right, memberSortColumn_);
            const bool leftMissing = leftRaw.empty();
            const bool rightMissing = rightRaw.empty();
            if (leftMissing != rightMissing) {
                return !leftMissing;
            }
            const std::string leftValue = lowerAscii(leftRaw);
            const std::string rightValue = lowerAscii(rightRaw);
            if (memberSortAscending_) {
                return leftValue < rightValue;
            }
            return leftValue > rightValue;
        });
    }

    void RenderMemberListRows()
    {
        memberList.DeleteItem(DG::ListBox::AllItems);
        for (const auto& member : memberRows_) {
            memberList.AppendItem();
            const short item = memberList.GetItemCount();
            memberList.SetTabItemText(item, 1, displayValue(member.elementType));
            memberList.SetTabItemText(item, 2, displayValue(member.elementId));
            memberList.SetTabItemText(item, 3, displayValue(displayLayerName(member.layerName)));
        }
        UpdateMemberSortHeader();
    }

    void LayoutMemberSection()
    {
        const short clientWidth = GetClientWidth();
        const short clientHeight = GetClientHeight();
        const short closeLeft = std::max<short>(LeftMargin, clientWidth - RightMargin - CloseButtonWidth);
        const short closeTop = membersExpanded_
            ? std::max<short>(CollapsedCloseTop, clientHeight - BottomMargin - CloseButtonHeight)
            : CollapsedCloseTop;
        closeButton.SetPosition(closeLeft, closeTop);

        const short listWidth = std::max<short>(120, clientWidth - LeftMargin - RightMargin);
        const short listBottom = std::max<short>(MemberListTop + 48, closeTop - MemberListBottomGap);
        const short listHeight = std::max<short>(48, listBottom - MemberListTop);
        memberList.SetSize(listWidth, listHeight);
        ConfigureMemberListTabs();
    }

    void RefreshMemberList(const std::string& assemblyUuid)
    {
        memberRows_.clear();
        if (assemblyUuid.empty()) {
            RenderMemberListRows();
            return;
        }

        memberRows_ = runtime_.commandService().listWrapperMemberMetadata(assemblyUuid);
        ApplyMemberSort();
        RenderMemberListRows();
    }

    void UpdateMemberSectionVisibility()
    {
        membersHeaderText.Show();
        membersToggleButton.SetText(membersExpanded_ ? "Hide Members" : "Show Members");
        if (membersExpanded_) {
            SetClientHeight(expandedClientHeight_);
            memberList.Show();
        } else {
            SetClientHeight(CollapsedHeight);
            memberList.Hide();
        }
        LayoutMemberSection();
    }

    void ToggleMemberSection()
    {
        membersExpanded_ = !membersExpanded_;
        UpdateMemberSectionVisibility();
        RefreshMemberList(SelectedUuid());
    }

    void SelectMemberFromList()
    {
        const std::string uuid = SelectedUuid();
        const std::string elementGuid = SelectedMemberGuid();
        if (uuid.empty() || elementGuid.empty()) {
            messageText.SetText("Select a wrapper member first.");
            return;
        }
        const CommandResult result = runtime_.commandService().selectWrapperMember(uuid, elementGuid);
        messageText.SetText(toUniString(commandResultReport(result)));
    }

    template <typename Callback>
    void RunMutation(const char* undoName, Callback callback)
    {
        CommandResult result{false, "BuildSync command did not run.", {}};
        const GSErrCode error = ACAPI_CallUndoableCommand(undoName, [&]() -> GSErrCode {
            result = callback();
            return result.ok ? NoError : Error;
        });
        if (error != NoError && result.message == "BuildSync command did not run.") {
            result = {false, "Archicad rejected the wrapper operation. error=" + errorCodeString(error), {}};
        }
        messageText.SetText(toUniString(commandResultReport(result)));
        RefreshWrappers(SelectedUuid());
    }

    void CreateWrapper()
    {
        RunMutation("BuildSync Create Wrapper", [&]() {
            return runtime_.commandService().createAssemblyFromSelection(CurrentCreateRequest());
        });
    }

    void DeleteWrapper()
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a wrapper to delete.");
            return;
        }
        if (DG::WarningAlert("Delete wrapper?", "This clears BuildSync properties from every member element.", "Delete", "Cancel") != DG::Accept) {
            messageText.SetText("Delete cancelled.");
            return;
        }
        RunMutation("BuildSync Delete Wrapper", [&]() {
            return runtime_.commandService().deleteWrapper(uuid);
        });
    }

    void SelectMembers(bool sendBehind)
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a wrapper first.");
            return;
        }
        const CommandResult result = runtime_.commandService().selectWrapperMembers(uuid);
        messageText.SetText(toUniString(commandResultReport(result)));
        if (result.ok && sendBehind) {
            SendToBack();
        }
    }

    void AddSelection()
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a target wrapper first.");
            return;
        }
        RunMutation("BuildSync Add Selection", [&]() {
            return runtime_.commandService().addSelectionToAssembly(uuid);
        });
    }

    void SaveDetails()
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a wrapper to save.");
            return;
        }
        RunMutation("BuildSync Save Wrapper", [&]() {
            return runtime_.commandService().updateWrapper(uuid, CurrentUpdateRequest());
        });
    }

    void SetCustomProperty()
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a wrapper first.");
            return;
        }
        const std::string key = toStdString(propertyKeyEdit.GetText());
        const std::string value = toStdString(propertyValueEdit.GetText());
        RunMutation("BuildSync Set Wrapper Property", [&]() {
            return runtime_.commandService().setWrapperCustomProperty(uuid, key, value);
        });
    }

    void RemoveCustomProperty()
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a wrapper first.");
            return;
        }
        const std::string key = toStdString(propertyKeyEdit.GetText());
        RunMutation("BuildSync Remove Wrapper Property", [&]() {
            return runtime_.commandService().removeWrapperCustomProperty(uuid, key);
        });
    }
};

std::unique_ptr<WrapperManagerDialog> wrapperManagerDialog;

::GSErrCode WrapperManagerPaletteControlCallBack(Int32, API_PaletteMessageID messageID, GS::IntPtr param)
{
    switch (messageID) {
        case APIPalMsg_OpenPalette:
            if (wrapperManagerDialog != nullptr) {
                wrapperManagerDialog->Show();
            }
            break;
        case APIPalMsg_ClosePalette:
            if (wrapperManagerDialog != nullptr) {
                wrapperManagerDialog->Hide();
            }
            break;
        case APIPalMsg_HidePalette_Begin:
            if (wrapperManagerDialog != nullptr && wrapperManagerDialog->IsVisible()) {
                wrapperManagerDialog->Hide();
            }
            break;
        case APIPalMsg_HidePalette_End:
            if (wrapperManagerDialog != nullptr && !wrapperManagerDialog->IsVisible()) {
                wrapperManagerDialog->Show();
            }
            break;
        case APIPalMsg_DisableItems_Begin:
            if (wrapperManagerDialog != nullptr && wrapperManagerDialog->IsVisible()) {
                wrapperManagerDialog->DisableItems();
            }
            break;
        case APIPalMsg_DisableItems_End:
            if (wrapperManagerDialog != nullptr && wrapperManagerDialog->IsVisible()) {
                wrapperManagerDialog->EnableItems();
            }
            break;
        case APIPalMsg_IsPaletteVisible:
            *(reinterpret_cast<bool*>(param)) = wrapperManagerDialog != nullptr && wrapperManagerDialog->IsVisible();
            break;
        default:
            break;
    }
    return NoError;
}

} // namespace

void ShowWrapperManagerDialog(NativeRuntime& runtime)
{
    if (wrapperManagerDialog == nullptr) {
        wrapperManagerDialog = std::make_unique<WrapperManagerDialog>(runtime);
        ACAPI_KeepInMemory(true);
    }
    wrapperManagerDialog->Show();
}

void DestroyWrapperManagerDialog()
{
    wrapperManagerDialog.reset();
}

int RegisterWrapperManagerPalette()
{
    return ACAPI_RegisterModelessWindow(
        GS::CalculateHashValue(WrapperManagerPaletteGuid),
        WrapperManagerPaletteControlCallBack,
        API_PalEnabled_FloorPlan + API_PalEnabled_Section + API_PalEnabled_Elevation +
            API_PalEnabled_InteriorElevation + API_PalEnabled_Detail + API_PalEnabled_Worksheet +
            API_PalEnabled_Layout + API_PalEnabled_3D + API_PalEnabled_DocumentFrom3D,
        GSGuid2APIGuid(WrapperManagerPaletteGuid));
}

} // namespace buildsync
