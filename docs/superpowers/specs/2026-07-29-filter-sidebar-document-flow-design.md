# Filter Sidebar Document-Flow Design

## Goal

Let the desktop Filters sidebar end with its own content instead of continuing
to follow the catalog, while preserving the Kit Builder as a persistent,
independently scrollable workspace.

## Desktop behavior

The Filters sidebar participates in ordinary document flow. Its height is
determined by its filter controls and footer, with no viewport-height cap,
sticky positioning, or internal vertical scrollbar. As the document scrolls,
the complete Filters sidebar moves with the page. After its bottom has passed,
the catalog can continue without the Filters sidebar following it.

Selecting or clearing a filter may change the catalog result height, but must
not clip the Filters sidebar, its final filter group, or its legal-information
footer. The sidebar remains fully reachable through the document scrollbar
even when the result set is empty or shorter than the filter content.

The Filter sheet used at the mobile breakpoint is not part of this change. It
retains its existing bounded modal scrolling.

## Kit Builder boundary

The desktop Kit Builder does not adopt the Filters sidebar behavior. It remains
sticky and viewport-bounded so the user's current Kit stays visible while they
browse catalog cards. Its existing internal scrollbar remains the way users
reach Kit cards and controls that exceed the available panel height.

Collapsed, inspect, and build modes retain their current positioning, sizing,
and scroll behavior. Mobile Kit Builder behavior is also unchanged.

## Implementation boundary

The change is limited to the desktop Filters sidebar layout and regression
coverage. It must not alter filter semantics, URL state, catalog result
calculation, Kit Builder height calculation, Kit Builder scroll restoration,
or responsive breakpoints.

## Verification

Test-first coverage will reproduce the reported desktop state with an active
filter and then verify:

- the last Filters control and legal-information footer are not clipped;
- the Filters sidebar has natural content height and no internal vertical
  scrolling;
- document scrolling can pass the end of the Filters sidebar;
- empty, short, and long filtered result sets preserve that behavior;
- the Kit Builder remains sticky, viewport-bounded, and internally scrollable;
- desktop collapsed, inspect, and build Kit Builder modes remain unchanged;
- the mobile Filter sheet and mobile Kit Builder retain their existing
  overflow behavior.

Focused layout tests will be followed by the relevant catalog and Kits
end-to-end suites. Desktop visual inspection will use an active filter and a
result set whose height differs materially from the Filters sidebar.
