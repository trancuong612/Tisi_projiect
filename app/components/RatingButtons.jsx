export default function RatingButtons({ disabled = false }) {
  const buttons = [
    {
      value: 1,
      title: "Quên",
      sub: "Không nhớ",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    },
    {
      value: 2,
      title: "Khó",
      sub: "Nhớ rất khó",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      value: 3,
      title: "Tốt",
      sub: "Nhớ được",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    {
      value: 4,
      title: "Dễ",
      sub: "Nhớ ngay",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
  ];

  return (
    <div className="mt-5">
      <p className="mb-3 text-center text-xs font-bold text-slate-400">
        Bạn nhớ từ này ở mức nào?
      </p>

      <div className="grid grid-cols-4 gap-2">
        {buttons.map((button) => (
          <button
            key={button.value}
            type="submit"
            name="rating"
            value={button.value}
            disabled={disabled}
            className={[
              "rounded-2xl border px-2 py-3 transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
              button.className,
            ].join(" ")}>
            <div className="text-sm font-black">{button.title}</div>

            <div className="mt-1 hidden text-[10px] font-bold opacity-70 sm:block">
              {button.sub}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
