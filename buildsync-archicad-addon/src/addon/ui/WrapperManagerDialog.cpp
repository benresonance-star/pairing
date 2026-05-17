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
        , wrapperDetailsHeaderText(GetReference(), WrapperDetailsHeaderTextId)
        , idLabelText(GetReference(), IdLabelTextId)
        , idEdit(GetReference(), IdEditId)
        , nameLabelText(GetReference(), NameLabelTextId)
        , nameEdit(GetReference(), NameEditId)
        , typeLabelText(GetReference(), TypeLabelTextId)
        , typeEdit(GetReference(), TypeEditId)
        , zoneLabelText(GetReference(), ZoneLabelTextId)
        , zoneEdit(GetReference(), ZoneEditId)
        , levelLabelText(GetReference(), LevelLabelTextId)
        , levelEdit(GetReference(), LevelEditId)
        , tradeLabelText(GetReference(), TradeLabelTextId)
        , tradeEdit(GetReference(), TradeEditId)
        , taskIdLabelText(GetReference(), TaskIdLabelTextId)
        , taskIdEdit(GetReference(), TaskIdEditId)
        , statusLabelText(GetReference(), StatusLabelTextId)
        , statusEdit(GetReference(), StatusEditId)
        , saveButton(GetReference(), SaveButtonId)
        , propertyKeyLabelText(GetReference(), PropertyKeyLabelTextId)
        , propertyKeyEdit(GetReference(), PropertyKeyEditId)
        , propertyValueLabelText(GetReference(), PropertyValueLabelTextId)
        , propertyValueEdit(GetReference(), PropertyValueEditId)
        , setPropertyButton(GetReference(), SetPropertyButtonId)
        , removePropertyButton(GetReference(), RemovePropertyButtonId)
        , messageText(GetReference(), MessageTextId)
        , refreshButton(GetReference(), RefreshButtonId)
        , membersHeaderText(GetReference(), MembersHeaderTextId)
        , membersToggleButton(GetReference(), MembersToggleButtonId)
        , memberList(GetReference(), MemberListId)
        , childWrappersHeaderText(GetReference(), ChildWrappersHeaderTextId)
        , childWrapperList(GetReference(), ChildWrapperListId)
        , addChildWrapperButton(GetReference(), AddChildWrapperButtonId)
        , removeChildWrapperButton(GetReference(), RemoveChildWrapperButtonId)
        , selectBranchMembersButton(GetReference(), SelectBranchMembersButtonId)
        , placeInstanceButton(GetReference(), PlaceInstanceButtonId)
        , selectInstanceButton(GetReference(), SelectInstanceButtonId)
        , enterEditButton(GetReference(), EnterEditButtonId)
        , applyEditButton(GetReference(), ApplyEditButtonId)
        , cancelEditButton(GetReference(), CancelEditButtonId)
        , runtime_(runtime)
    {
        Attach(*this);
        AttachToAllItems(*this);
        wrapperList.Attach(*this);
        wrapperList.SetTabFieldCount(1);
        wrapperList.SetTabFieldProperties(1, 0, 250, DG::ListBox::Left, DG::ListBox::EndTruncate, false, true);
        childWrapperList.Attach(*this);
        childWrapperList.SetTabFieldCount(1);
        childWrapperList.SetTabFieldProperties(1, 0, 360, DG::ListBox::Left, DG::ListBox::EndTruncate, false, true);
        memberList.Attach(*this);
        memberList.SetTabFieldCount(3);
        ConfigureMemberListHeader();
        ConfigureMemberListTabs();
        messageText.SetWordWrap(true);
        ConfigureStaticLabels();
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
            SelectMembers();
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
        } else if (event.GetSource() == &membersToggleButton) {
            ToggleMemberSection();
        } else if (event.GetSource() == &addChildWrapperButton) {
            AddChildWrapperFromSelection();
        } else if (event.GetSource() == &removeChildWrapperButton) {
            RemoveSelectedChildWrapper();
        } else if (event.GetSource() == &selectBranchMembersButton) {
            SelectBranchMembers();
        } else if (event.GetSource() == &placeInstanceButton) {
            PlaceInstance();
        } else if (event.GetSource() == &selectInstanceButton) {
            SelectSelectedInstance();
        } else if (event.GetSource() == &enterEditButton) {
            EnterEditMode();
        } else if (event.GetSource() == &applyEditButton) {
            ApplyEditMode();
        } else if (event.GetSource() == &cancelEditButton) {
            CancelEditMode();
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
        } else if (event.GetSource() == &childWrapperList) {
            NavigateToSelectedChildWrapper();
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
        LayoutPalette();
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
        WrapperDetailsHeaderTextId = 10,
        IdLabelTextId = 11,
        IdEditId = 12,
        NameLabelTextId = 13,
        NameEditId = 14,
        TypeLabelTextId = 15,
        TypeEditId = 16,
        ZoneLabelTextId = 17,
        ZoneEditId = 18,
        LevelLabelTextId = 19,
        LevelEditId = 20,
        TradeLabelTextId = 21,
        TradeEditId = 22,
        TaskIdLabelTextId = 23,
        TaskIdEditId = 24,
        StatusLabelTextId = 25,
        StatusEditId = 26,
        SaveButtonId = 27,
        PropertyKeyLabelTextId = 28,
        PropertyKeyEditId = 29,
        PropertyValueLabelTextId = 30,
        PropertyValueEditId = 31,
        SetPropertyButtonId = 32,
        RemovePropertyButtonId = 33,
        MessageTextId = 34,
        RefreshButtonId = 35,
        MembersHeaderTextId = 37,
        MembersToggleButtonId = 38,
        MemberListId = 39,
        ChildWrappersHeaderTextId = 40,
        ChildWrapperListId = 41,
        AddChildWrapperButtonId = 42,
        RemoveChildWrapperButtonId = 43,
        SelectBranchMembersButtonId = 44,
        PlaceInstanceButtonId = 45,
        SelectInstanceButtonId = 46,
        EnterEditButtonId = 47,
        ApplyEditButtonId = 48,
        CancelEditButtonId = 49,
    };

    static constexpr short CollapsedHeight = 620;
    static constexpr short ExpandedHeight = 760;
    static constexpr short LeftMargin = 12;
    static constexpr short RightMargin = 15;
    static constexpr short CloseButtonWidth = 70;
    static constexpr short CloseButtonHeight = 24;
    static constexpr short TopMargin = 10;
    static constexpr short WrapperListTop = 32;
    static constexpr short WrapperListHeight = 250;
    static constexpr short WrapperListWidth = 280;
    static constexpr short DetailLeftGap = 12;
    static constexpr short LabelWidth = 75;
    static constexpr short LabelEditGap = 8;
    static constexpr short EditHeight = 22;
    static constexpr short DetailRowGap = 8;
    static constexpr short DetailRowStep = 28;
    static constexpr short ActionButtonHeight = 24;
    static constexpr short SectionGap = 10;
    static constexpr short CollapsedCloseTop = 586;
    static constexpr short MessageTextHeight = 84;
    static constexpr short ChildWrapperListHeight = 72;
    static constexpr short ChildActionButtonWidth = 112;
    static constexpr short ChildActionButtonHeight = 24;
    static constexpr short ChildActionButtonGap = 7;
    static constexpr short MemberListBottomGap = 8;
    static constexpr short BottomMargin = 8;
    static constexpr short MinimumExpandedMemberListHeight = 96;
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
    DG::LeftText wrapperDetailsHeaderText;
    DG::LeftText idLabelText;
    DG::TextEdit idEdit;
    DG::LeftText nameLabelText;
    DG::TextEdit nameEdit;
    DG::LeftText typeLabelText;
    DG::TextEdit typeEdit;
    DG::LeftText zoneLabelText;
    DG::TextEdit zoneEdit;
    DG::LeftText levelLabelText;
    DG::TextEdit levelEdit;
    DG::LeftText tradeLabelText;
    DG::TextEdit tradeEdit;
    DG::LeftText taskIdLabelText;
    DG::TextEdit taskIdEdit;
    DG::LeftText statusLabelText;
    DG::TextEdit statusEdit;
    DG::Button saveButton;
    DG::LeftText propertyKeyLabelText;
    DG::TextEdit propertyKeyEdit;
    DG::LeftText propertyValueLabelText;
    DG::TextEdit propertyValueEdit;
    DG::Button setPropertyButton;
    DG::Button removePropertyButton;
    DG::RichEdit messageText;
    DG::Button refreshButton;
    DG::LeftText membersHeaderText;
    DG::Button membersToggleButton;
    DG::SingleSelListBox memberList;
    DG::LeftText childWrappersHeaderText;
    DG::SingleSelListBox childWrapperList;
    DG::Button addChildWrapperButton;
    DG::Button removeChildWrapperButton;
    DG::Button selectBranchMembersButton;
    DG::Button placeInstanceButton;
    DG::Button selectInstanceButton;
    DG::Button enterEditButton;
    DG::Button applyEditButton;
    DG::Button cancelEditButton;
    NativeRuntime& runtime_;
    std::vector<Assembly> wrappers_;
    std::vector<Assembly> childWrappers_;
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

    void ClearDetails()
    {
        idEdit.SetText("");
        nameEdit.SetText("");
        typeEdit.SetText("");
        zoneEdit.SetText("");
        levelEdit.SetText("");
        tradeEdit.SetText("");
        taskIdEdit.SetText("");
        statusEdit.SetText("");
        propertyKeyEdit.SetText("");
        propertyValueEdit.SetText("");
    }

    void PopulateDetails(const Assembly& wrapper)
    {
        idEdit.SetText(toUniString(wrapper.assemblyId));
        nameEdit.SetText(toUniString(wrapper.name));
        typeEdit.SetText(toUniString(wrapper.type));
        zoneEdit.SetText(toUniString(wrapper.zone));
        levelEdit.SetText(toUniString(wrapper.level));
        tradeEdit.SetText(toUniString(wrapper.trade));
        taskIdEdit.SetText(toUniString(wrapper.taskId));
        statusEdit.SetText(toUniString(wrapper.status));
        if (!wrapper.customProperties.empty()) {
            propertyKeyEdit.SetText(toUniString(wrapper.customProperties.front().key));
            propertyValueEdit.SetText(toUniString(wrapper.customProperties.front().value));
        } else {
            propertyKeyEdit.SetText("");
            propertyValueEdit.SetText("");
        }
    }

    void LoadSelectedWrapper()
    {
        const std::string uuid = SelectedUuid();
        const auto wrapper = uuid.empty() ? std::optional<Assembly>{} : runtime_.commandService().getWrapper(uuid);
        if (!wrapper) {
            ClearDetails();
            RefreshMemberList("");
            return;
        }

        PopulateDetails(*wrapper);
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

    std::string SelectedChildWrapperUuid() const
    {
        const short selected = childWrapperList.GetSelectedItem();
        if (selected <= 0 || static_cast<std::size_t>(selected) > childWrappers_.size()) {
            return "";
        }
        return childWrappers_[selected - 1].assemblyUuid;
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

    void ConfigureStaticLabels()
    {
        wrapperDetailsHeaderText.SetText("Wrapper Details");
        idLabelText.SetText("ID");
        nameLabelText.SetText("Name");
        typeLabelText.SetText("Type");
        zoneLabelText.SetText("Zone");
        levelLabelText.SetText("Level");
        tradeLabelText.SetText("Trade");
        taskIdLabelText.SetText("Task ID");
        statusLabelText.SetText("Status");
        propertyKeyLabelText.SetText("Prop Key");
        propertyValueLabelText.SetText("Prop Value");
        membersHeaderText.SetText("Members");
        childWrappersHeaderText.SetText("Sub-Wrappers");
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
        if (memberRows_.empty()) {
            memberList.AppendItem();
            const short item = memberList.GetItemCount();
            memberList.SetTabItemText(item, 1, "No members found");
            memberList.SetTabItemText(item, 2, "");
            memberList.SetTabItemText(item, 3, "");
            UpdateMemberSortHeader();
            return;
        }
        for (const auto& member : memberRows_) {
            memberList.AppendItem();
            const short item = memberList.GetItemCount();
            memberList.SetTabItemText(item, 1, displayValue(member.elementType));
            memberList.SetTabItemText(item, 2, displayValue(member.elementId));
            memberList.SetTabItemText(item, 3, displayValue(displayLayerName(member.layerName)));
        }
        UpdateMemberSortHeader();
    }

    void LayoutPalette()
    {
        const short clientWidth = GetClientWidth();
        const short clientHeight = GetClientHeight();
        const short closeLeft = std::max<short>(LeftMargin, clientWidth - RightMargin - CloseButtonWidth);
        const short closeTop = membersExpanded_
            ? std::max<short>(CollapsedCloseTop, clientHeight - BottomMargin - CloseButtonHeight)
            : CollapsedCloseTop;
        closeButton.SetPosition(closeLeft, closeTop);

        wrapperList.SetPosition(LeftMargin, WrapperListTop);
        wrapperList.SetSize(WrapperListWidth, WrapperListHeight);
        wrapperList.SetTabFieldProperties(1, 0, std::max<short>(120, WrapperListWidth - 18), DG::ListBox::Left, DG::ListBox::EndTruncate, false, true);

        const short leftSecondColumn = LeftMargin + 140;
        createButton.SetPosition(LeftMargin, 292);
        createButton.SetSize(132, ActionButtonHeight);
        deleteButton.SetPosition(leftSecondColumn, 292);
        deleteButton.SetSize(95, ActionButtonHeight);
        selectMembersButton.SetPosition(LeftMargin, 322);
        selectMembersButton.SetSize(132, ActionButtonHeight);
        addSelectionButton.SetPosition(leftSecondColumn, 322);
        addSelectionButton.SetSize(132, ActionButtonHeight);
        removeSelectionButton.SetPosition(LeftMargin, 352);
        removeSelectionButton.SetSize(132, ActionButtonHeight);
        repairButton.SetPosition(leftSecondColumn, 352);
        repairButton.SetSize(132, ActionButtonHeight);
        refreshButton.SetPosition(LeftMargin, 382);
        refreshButton.SetSize(85, ActionButtonHeight);

        const short detailLeft = LeftMargin + WrapperListWidth + DetailLeftGap;
        const short editLeft = detailLeft + LabelWidth + LabelEditGap;
        const short editWidth = std::max<short>(220, clientWidth - editLeft - RightMargin);
        const short compactEditWidth = std::max<short>(140, editWidth / 2);
        const short rightButtonWidth = 80;
        const short rightButtonLeft = std::max<short>(editLeft + compactEditWidth + 8, clientWidth - RightMargin - rightButtonWidth);
        const short setButtonLeft = std::max<short>(editLeft + compactEditWidth + 8, rightButtonLeft - rightButtonWidth - 7);

        auto layoutDetailRow = [&](short top, DG::LeftText& label, DG::TextEdit& edit) {
            label.SetPosition(detailLeft, top + 2);
            label.SetSize(LabelWidth, 18);
            edit.SetPosition(editLeft, top);
            edit.SetSize(editWidth, EditHeight);
        };

        wrapperDetailsHeaderText.SetPosition(detailLeft, TopMargin);
        wrapperDetailsHeaderText.SetSize(160, 18);
        short y = 38;
        layoutDetailRow(y, idLabelText, idEdit);
        y += DetailRowStep;
        layoutDetailRow(y, nameLabelText, nameEdit);
        y += DetailRowStep;
        layoutDetailRow(y, typeLabelText, typeEdit);
        y += DetailRowStep;
        layoutDetailRow(y, zoneLabelText, zoneEdit);
        y += DetailRowStep;
        layoutDetailRow(y, levelLabelText, levelEdit);
        y += DetailRowStep;
        layoutDetailRow(y, tradeLabelText, tradeEdit);
        y += DetailRowStep;
        layoutDetailRow(y, taskIdLabelText, taskIdEdit);
        y += DetailRowStep;
        layoutDetailRow(y, statusLabelText, statusEdit);

        const short saveTop = y + EditHeight + DetailRowGap;
        saveButton.SetPosition(editLeft, saveTop);
        saveButton.SetSize(110, ActionButtonHeight);

        const short propertyKeyTop = saveTop + ActionButtonHeight + SectionGap;
        propertyKeyLabelText.SetPosition(detailLeft, propertyKeyTop + 2);
        propertyKeyLabelText.SetSize(LabelWidth, 18);
        propertyKeyEdit.SetPosition(editLeft, propertyKeyTop);
        propertyKeyEdit.SetSize(std::min<short>(compactEditWidth, std::max<short>(80, setButtonLeft - editLeft - 8)), EditHeight);
        setPropertyButton.SetPosition(setButtonLeft, propertyKeyTop - 1);
        setPropertyButton.SetSize(60, ActionButtonHeight);
        removePropertyButton.SetPosition(rightButtonLeft, propertyKeyTop - 1);
        removePropertyButton.SetSize(rightButtonWidth, ActionButtonHeight);

        const short propertyValueTop = propertyKeyTop + DetailRowStep;
        propertyValueLabelText.SetPosition(detailLeft, propertyValueTop + 2);
        propertyValueLabelText.SetSize(LabelWidth, 18);
        propertyValueEdit.SetPosition(editLeft, propertyValueTop);
        propertyValueEdit.SetSize(editWidth, EditHeight);

        const short instanceTop = propertyValueTop + EditHeight + SectionGap;
        const short actionGap = 8;
        const short primaryActionWidth = 118;
        const short secondaryActionWidth = 108;
        const short tertiaryActionWidth = 100;
        placeInstanceButton.SetPosition(editLeft, instanceTop);
        placeInstanceButton.SetSize(primaryActionWidth, ActionButtonHeight);
        selectInstanceButton.SetPosition(editLeft + primaryActionWidth + actionGap, instanceTop);
        selectInstanceButton.SetSize(secondaryActionWidth, ActionButtonHeight);
        enterEditButton.SetPosition(editLeft + primaryActionWidth + secondaryActionWidth + actionGap * 2, instanceTop);
        enterEditButton.SetSize(tertiaryActionWidth, ActionButtonHeight);
        applyEditButton.SetPosition(editLeft, instanceTop + ActionButtonHeight + 6);
        applyEditButton.SetSize(primaryActionWidth, ActionButtonHeight);
        cancelEditButton.SetPosition(editLeft + primaryActionWidth + actionGap, instanceTop + ActionButtonHeight + 6);
        cancelEditButton.SetSize(secondaryActionWidth, ActionButtonHeight);

        const short statusTop = instanceTop + ActionButtonHeight * 2 + 16;
        const short contentWidth = std::max<short>(220, clientWidth - LeftMargin - RightMargin);
        messageText.SetPosition(LeftMargin, statusTop);
        messageText.SetSize(contentWidth, MessageTextHeight);

        const short membersTop = statusTop + MessageTextHeight + SectionGap;
        membersHeaderText.SetPosition(LeftMargin, membersTop + 3);
        membersHeaderText.SetSize(80, 18);
        membersToggleButton.SetPosition(LeftMargin + 88, membersTop);
        membersToggleButton.SetSize(125, ActionButtonHeight);

        if (!membersExpanded_) {
            memberList.SetSize(contentWidth, 48);
            ConfigureMemberListTabs();
            return;
        }

        const short childHeaderTop = membersTop + ActionButtonHeight + SectionGap;
        childWrappersHeaderText.SetPosition(LeftMargin, childHeaderTop);
        childWrappersHeaderText.SetSize(120, 18);

        const short childListTop = childHeaderTop + 24;
        const short childButtonsWidth = ChildActionButtonWidth * 2 + ChildActionButtonGap;
        const short childButtonsLeft = std::max<short>(LeftMargin + 220, clientWidth - RightMargin - childButtonsWidth);
        const short childListWidth = std::max<short>(160, childButtonsLeft - LeftMargin - ChildActionButtonGap);
        childWrapperList.SetPosition(LeftMargin, childListTop);
        childWrapperList.SetSize(childListWidth, ChildWrapperListHeight);
        childWrapperList.SetTabFieldProperties(1, 0, std::max<short>(120, childListWidth - 18), DG::ListBox::Left, DG::ListBox::EndTruncate, false, true);
        addChildWrapperButton.SetPosition(childButtonsLeft, childListTop);
        addChildWrapperButton.SetSize(ChildActionButtonWidth, ChildActionButtonHeight);
        removeChildWrapperButton.SetPosition(childButtonsLeft + ChildActionButtonWidth + ChildActionButtonGap, childListTop);
        removeChildWrapperButton.SetSize(ChildActionButtonWidth, ChildActionButtonHeight);
        selectBranchMembersButton.SetPosition(childButtonsLeft, childListTop + ChildActionButtonHeight + 6);
        selectBranchMembersButton.SetSize(140, ChildActionButtonHeight);

        const short memberTop = childListTop + ChildWrapperListHeight + 20;
        const short listBottom = std::max<short>(memberTop + MinimumExpandedMemberListHeight, closeTop - MemberListBottomGap);
        const short listHeight = std::max<short>(MinimumExpandedMemberListHeight, listBottom - memberTop);
        memberList.SetPosition(LeftMargin, memberTop);
        memberList.SetSize(contentWidth, listHeight);
        ConfigureMemberListTabs();
    }

    void RefreshMemberList(const std::string& assemblyUuid)
    {
        memberRows_.clear();
        RefreshChildWrapperList(assemblyUuid);
        if (assemblyUuid.empty()) {
            RenderMemberListRows();
            return;
        }

        memberRows_ = runtime_.commandService().listWrapperMemberMetadata(assemblyUuid);
        ApplyMemberSort();
        RenderMemberListRows();
    }

    void RefreshChildWrapperList(const std::string& assemblyUuid)
    {
        childWrappers_.clear();
        childWrapperList.DeleteItem(DG::ListBox::AllItems);
        if (assemblyUuid.empty()) {
            return;
        }

        childWrappers_ = runtime_.commandService().listChildWrappers(assemblyUuid);
        for (const auto& child : childWrappers_) {
            childWrapperList.AppendItem();
            const short item = childWrapperList.GetItemCount();
            const std::string label = child.assemblyId + "  " + child.name + "  direct members=" + std::to_string(child.members.size());
            childWrapperList.SetTabItemText(item, 1, toUniString(label));
        }
    }

    void UpdateMemberSectionVisibility()
    {
        membersHeaderText.Show();
        membersToggleButton.SetText(membersExpanded_ ? "Hide Members" : "Show Members");
        if (membersExpanded_) {
            expandedClientHeight_ = std::max<short>(expandedClientHeight_, ExpandedHeight);
            SetClientHeight(expandedClientHeight_);
            childWrappersHeaderText.Show();
            childWrapperList.Show();
            addChildWrapperButton.Show();
            removeChildWrapperButton.Show();
            selectBranchMembersButton.Show();
            memberList.Show();
        } else {
            SetClientHeight(CollapsedHeight);
            childWrappersHeaderText.Hide();
            childWrapperList.Hide();
            addChildWrapperButton.Hide();
            removeChildWrapperButton.Hide();
            selectBranchMembersButton.Hide();
            memberList.Hide();
        }
        LayoutPalette();
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

    void NavigateToSelectedChildWrapper()
    {
        const std::string childUuid = SelectedChildWrapperUuid();
        if (childUuid.empty()) {
            messageText.SetText("Select a child wrapper first.");
            return;
        }
        RefreshWrappers(childUuid);
        messageText.SetText("BuildSync: Child wrapper selected.");
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

    void RunRuntimeCommand(short commandId, const char* statusLabel, bool undoable)
    {
        messageText.SetText(toUniString(std::string("BuildSync: Running ") + statusLabel + "..."));
        const auto runCommand = [&]() {
            return runtime_.handleMenuCommand(commandId);
        };
        if (undoable) {
            RunMutation(statusLabel, runCommand);
            return;
        }
        const CommandResult result = runCommand();
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

    void SelectMembers()
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a wrapper first.");
            return;
        }
        const CommandResult result = runtime_.commandService().selectWrapperBranchMembers(uuid);
        messageText.SetText(toUniString(commandResultReport(result)));
    }

    void SelectBranchMembers()
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a wrapper first.");
            return;
        }
        const CommandResult result = runtime_.commandService().selectWrapperBranchMembers(uuid);
        messageText.SetText(toUniString(commandResultReport(result)));
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

    void PlaceInstance()
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a wrapper to place an instance.");
            return;
        }
        RunMutation("BuildSync Place Wrapper Instance", [&]() {
            return runtime_.commandService().placeWrapperInstance({uuid, "Wrapper Instance", {100.0, 0.0, 0.0, false}});
        });
    }

    void SelectSelectedInstance()
    {
        const CommandResult result = runtime_.commandService().selectSelectedElementInstance();
        messageText.SetText(toUniString(commandResultReport(result)));
    }

    void EnterEditMode()
    {
        RunRuntimeCommand(EnterWrapperEditModeCommandId, "BuildSync Enter Wrapper Edit", false);
    }

    void ApplyEditMode()
    {
        RunRuntimeCommand(ApplyWrapperEditCommandId, "BuildSync Apply Wrapper Edit", true);
    }

    void CancelEditMode()
    {
        RunRuntimeCommand(CancelWrapperEditCommandId, "BuildSync Cancel Wrapper Edit", false);
    }

    void AddChildWrapperFromSelection()
    {
        const std::string uuid = SelectedUuid();
        if (uuid.empty()) {
            messageText.SetText("Select a parent wrapper first.");
            return;
        }
        RunMutation("BuildSync Add Child Wrapper", [&]() {
            return runtime_.commandService().addSelectedWrapperAsChild(uuid);
        });
    }

    void RemoveSelectedChildWrapper()
    {
        const std::string parentUuid = SelectedUuid();
        const std::string childUuid = SelectedChildWrapperUuid();
        if (parentUuid.empty() || childUuid.empty()) {
            messageText.SetText("Select a child wrapper first.");
            return;
        }
        RunMutation("BuildSync Remove Child Wrapper", [&]() {
            return runtime_.commandService().removeChildWrapper(parentUuid, childUuid);
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
