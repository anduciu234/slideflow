import { id, PATHS, readJson, writeJson } from "./config.js";
import { getDraft } from "./drafts.js";
import { uploadRenders } from "./storage/index.js";
import { accessToken } from "./tiktok/auth.js";
import { postPhotos, publishStatus } from "./tiktok/api.js";
import type { PostMode, QueueItem } from "./types.js";

export const loadQueue = () => readJson<QueueItem[]>(PATHS.queue, []);
const saveQueue = (q: QueueItem[]) => writeJson(PATHS.queue, q);

function update(itemId: string, patch: Partial<QueueItem>): QueueItem {
  const q = loadQueue();
  const i = q.findIndex((x) => x.id === itemId);
  if (i < 0) throw new Error(`No queue item ${itemId}`);
  q[i] = { ...q[i], ...patch, updatedAt: new Date().toISOString() };
  saveQueue(q);
  return q[i];
}

export function enqueue(opts: {
  draftId: string;
  account: string;
  scheduledAt: string;
  mode: PostMode;
  privacy?: string;
  autoMusic?: boolean;
  title?: string;
  caption?: string;
  disableComment?: boolean;
  brandOrganic?: boolean;
  brandedContent?: boolean;
}): QueueItem {
  getDraft(opts.draftId); // validate
  const when = new Date(opts.scheduledAt);
  if (Number.isNaN(when.getTime())) throw new Error(`Bad date: ${opts.scheduledAt}`);
  const item: QueueItem = {
    id: id("post"),
    ...opts,
    scheduledAt: when.toISOString(),
    status: "queued",
    updatedAt: new Date().toISOString(),
  };
  saveQueue([...loadQueue(), item]);
  return item;
}

export const cancel = (itemId: string) => update(itemId, { status: "cancelled" });

/** Uploads the draft's renders and sends them to TikTok. */
export async function publish(itemId: string): Promise<QueueItem> {
  const item = loadQueue().find((x) => x.id === itemId);
  if (!item) throw new Error(`No queue item ${itemId}`);
  update(itemId, { status: "uploading", error: undefined });
  try {
    const draft = getDraft(item.draftId);
    const token = await accessToken(item.account);
    const urls = await uploadRenders(draft.renders, draft.id);
    const publishId = await postPhotos({
      token,
      imageUrls: urls,
      title: item.title ?? draft.title,
      description: item.caption ?? draft.caption,
      mode: item.mode,
      privacy: item.privacy,
      autoMusic: item.autoMusic,
      disableComment: item.disableComment,
      brandOrganic: item.brandOrganic,
      brandedContent: item.brandedContent,
    });
    return update(itemId, { status: "processing", publishId });
  } catch (e) {
    return update(itemId, { status: "failed", error: (e as Error).message });
  }
}

/** Polls TikTok for items still processing. */
export async function refreshStatuses() {
  for (const item of loadQueue().filter((x) => x.status === "processing" && x.publishId)) {
    try {
      const s = await publishStatus(await accessToken(item.account), item.publishId!);
      const done = s.status === "PUBLISH_COMPLETE" || s.status === "SEND_TO_USER_INBOX";
      update(item.id, {
        tiktokStatus: s.status,
        status: s.status === "FAILED" ? "failed" : done ? "done" : "processing",
        error: s.fail_reason,
      });
    } catch (e) {
      console.error(`status ${item.id}: ${(e as Error).message}`);
    }
  }
}

/** Publishes everything due. Returns what it touched. */
export async function runDue(now = new Date()) {
  const due = loadQueue().filter((x) => x.status === "queued" && new Date(x.scheduledAt) <= now);
  const results = [];
  for (const item of due) results.push(await publish(item.id));
  await refreshStatuses();
  return results;
}
