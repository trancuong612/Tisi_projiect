import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { prisma } from "../utils/db.server";
import { parseVocabularyText, normalizeDay } from "../utils/parser";
import DesktopHeader from "../components/DesktopHeader";

export async function action({ request }) {
  const form = await request.formData();
  const raw = String(form.get("vocabulary") || "");
  const weekNumber = Number(form.get("weekNumber") || 1);
  const day = normalizeDay(String(form.get("day") || "MONDAY"));
  const dayLabel = String(form.get("dayLabel") || "").trim() || null;
  const title = String(form.get("title") || "").trim() || null;
  const { items, errors } = parseVocabularyText(raw);
  if (errors.length || !items.length) return json({ ok: false, errors, count: items.length }, { status: 400 });

  const week = await prisma.week.upsert({ where: { number: weekNumber }, update: {}, create: { number: weekNumber, title: `Tuần ${weekNumber}` } });
  let lesson = await prisma.lesson.findFirst({ where: { weekId: week.id, day, position: 0 } });
  if (!lesson) lesson = await prisma.lesson.create({ data: { weekId: week.id, day, dayLabel, title, position: 0 } });

  let created = 0;
  for (const item of items) {
    const exists = await prisma.vocabulary.findFirst({ where: { normalized: item.normalized, lessonId: lesson.id } });
    if (exists) continue;
    await prisma.vocabulary.create({ data: { ...item, lessonId: lesson.id, memory: { create: {} }, skill: { create: {} } } });
    created++;
  }
  return redirect(`/words?imported=${created}`);
}

export default function ImportPage() {
  const actionData = useActionData();
  return <><DesktopHeader/><main className="page-shell pb-28">
    <div className="mb-6"><Link to="/" className="text-sm font-bold text-emerald-700">← Trang chủ</Link><h1 className="mt-2 text-3xl font-black">Nhập bộ từ mới</h1><p className="mt-2 text-slate-500">Mỗi dòng một mục. Không giới hạn số lượng từ.</p></div>
    <Form method="post" className="soft-card space-y-5 rounded-[2rem] p-5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-3"><Field name="weekNumber" label="Tuần" type="number" defaultValue="1"/><Field name="day" label="Ngày" defaultValue="MONDAY"/><Field name="title" label="Tên bài" placeholder="Tuỳ chọn"/></div>
      <div><label className="mb-2 block text-sm font-black">Danh sách từ</label><textarea name="vocabulary" required rows={16} className="w-full rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 font-mono text-sm outline-none focus:border-emerald-400" placeholder={'abandon | /əˈbændən/ | verb | từ bỏ | They abandoned the project. | thường dùng với plan/project\nreluctant | /rɪˈlʌktənt/ | adjective | miễn cưỡng | She was reluctant to agree. | reluctant to + V'} /></div>
      {actionData?.errors?.length ? <div className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{actionData.errors.map((e)=><div key={e}>{e}</div>)}</div> : null}
      <button className="w-full rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white">Lưu bộ từ</button>
    </Form>
  </main></>;
}
function Field({label,...props}) { return <div><label className="mb-2 block text-sm font-black">{label}</label><input {...props} className="w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 outline-none focus:border-emerald-400"/></div>; }
