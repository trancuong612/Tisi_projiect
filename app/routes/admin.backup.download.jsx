import { createBackup } from "../services/backup.server";

export async function loader() {
  const backup = await createBackup();

  const date = new Date().toISOString().slice(0, 10);

  const filename = `bright-english-backup-${date}.json`;

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",

      "Content-Disposition": `attachment; filename="${filename}"`,

      "Cache-Control": "no-store",
    },
  });
}
