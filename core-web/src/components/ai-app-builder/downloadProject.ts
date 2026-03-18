import JSZip from "jszip";
import { saveAs } from "file-saver";

export async function downloadProjectAsZip(
  fileTree: Record<string, string>,
  projectName: string,
) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(fileTree)) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${projectName || "project"}.zip`);
}
