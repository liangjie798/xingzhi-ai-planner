export type WorkspaceView = "studio" | "map" | "plan" | "execution" | "library" | "archive";
const views: WorkspaceView[] = ["studio", "map", "plan", "execution", "library", "archive"];
/** An explicit URL wins after async hydration; absent URLs may restore a saved view. */
export function restoredWorkspaceView(search: string, saved?: WorkspaceView): WorkspaceView {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (params.has("view")) return views.includes(view as WorkspaceView) ? view as WorkspaceView : "studio";
  return saved && views.includes(saved) ? saved : "studio";
}
