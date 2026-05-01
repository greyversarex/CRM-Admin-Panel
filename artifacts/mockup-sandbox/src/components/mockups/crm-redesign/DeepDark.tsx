import React from "react";

export function DeepDark() {
  const menuGroups = [
    {
      title: "Обзор",
      items: [{ name: "Дашборд", active: true }],
    },
    {
      title: "Каталог",
      items: [{ name: "Каталог" }, { name: "Релизы" }, { name: "Артисты" }],
    },
    {
      title: "Дистрибуция",
      items: [{ name: "Дистрибуция" }, { name: "Доставка DDEX" }],
    },
    {
      title: "Финансы",
      items: [{ name: "Финансы" }, { name: "Роялти" }],
    },
    {
      title: "Аналитика",
      items: [{ name: "Аналитика" }, { name: "Плейлисты" }],
    },
    {
      title: "CRM",
      items: [{ name: "CRM" }, { name: "Коммуникации" }],
    },
    {
      title: "Система",
      items: [{ name: "Автоматизация" }, { name: "Настройки" }],
    },
  ];

  const metrics = [
    { label: "Артисты", value: "142" },
    { label: "Релизы", value: "847" },
    { label: "Доход", value: "$24 850" },
    { label: "Активных треков", value: "3 291" },
  ];

  const releases = [
    { name: "Ошики Ман", artist: "Nigina Amonqulova", status: "Выпущен", date: "12 Окт 2023", dsp: "Spotify, Apple" },
    { name: "Чони Ман", artist: "Shabnami Surayo", status: "В обработке", date: "15 Окт 2023", dsp: "Все площадки" },
    { name: "Зиндаги", artist: "Jonibek Murodov", status: "Черновик", date: "18 Окт 2023", dsp: "-" },
    { name: "Ватан", artist: "Sadriddin", status: "Выпущен", date: "01 Окт 2023", dsp: "Yandex, VK" },
    { name: "Булбул", artist: "Zulaykho", status: "Ошибка", date: "20 Окт 2023", dsp: "Spotify" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Выпущен": return "text-[#22C55E]";
      case "В обработке": return "text-[#EAB308]";
      case "Черновик": return "text-[#94A3B8]";
      case "Ошибка": return "text-[#EF4444]";
      default: return "text-[#94A3B8]";
    }
  };

  const chartData = [30, 45, 25, 60, 80, 50];
  const maxChartValue = Math.max(...chartData);

  return (
    <div className="flex w-full h-[800px] max-w-[1280px] bg-[#0A0B0F] text-[#F1F5F9] font-['Inter',sans-serif] overflow-hidden rounded-lg mx-auto shadow-2xl border border-[#1E2330]">
      {/* Sidebar */}
      <div className="w-[220px] bg-[#0D0E14] border-r border-[#1E2330] flex flex-col shrink-0">
        <div className="h-[60px] flex items-center px-6 border-b border-[#1E2330]">
          <div className="font-semibold tracking-tight text-lg text-[#F1F5F9]">Tajik Music</div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          {menuGroups.map((group, idx) => (
            <div key={idx} className="mb-6">
              <div className="px-6 mb-2 text-[10px] font-medium tracking-[0.08em] uppercase text-[#475569]">
                {group.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item, i) => (
                  <div
                    key={i}
                    className={`h-8 flex items-center px-6 text-sm cursor-pointer transition-colors relative ${
                      item.active ? "text-[#3B82F6] bg-[#3B82F6]/10" : "text-[#94A3B8] hover:text-[#F1F5F9]"
                    }`}
                  >
                    {item.active && (
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#3B82F6]"></div>
                    )}
                    {item.name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <div className="h-[60px] border-b border-[#1E2330] flex items-center justify-between px-8 shrink-0 bg-[#0A0B0F]">
          <div className="font-medium text-[15px] text-[#F1F5F9]">Дашборд</div>
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-[#1E2330] border border-[#3B82F6]/30 flex items-center justify-center text-xs font-medium text-[#60A5FA]">
              JD
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 flex flex-col gap-8 overflow-y-auto">
          {/* Metrics */}
          <div className="grid grid-cols-4 gap-4">
            {metrics.map((m, i) => (
              <div key={i} className="bg-[#111318] border border-[#1E2330] rounded-md p-4 flex flex-col gap-2">
                <div className="text-[12px] font-medium text-[#64748B]">{m.label}</div>
                <div className="text-2xl font-semibold text-[#F1F5F9]">{m.value}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-8">
            {/* Table Area */}
            <div className="flex-1 bg-[#111318] border border-[#1E2330] rounded-md flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1E2330]">
                <h2 className="text-[14px] font-medium text-[#F1F5F9]">Новые релизы</h2>
              </div>
              <div className="flex flex-col">
                <div className="grid grid-cols-12 px-5 py-2.5 text-[11px] font-medium text-[#475569] uppercase tracking-wider border-b border-[#1E2330] bg-[#0A0B0F]">
                  <div className="col-span-4">Релиз</div>
                  <div className="col-span-3">Артист</div>
                  <div className="col-span-2">Статус</div>
                  <div className="col-span-2">Дата</div>
                  <div className="col-span-1">DSP</div>
                </div>
                {releases.map((r, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-12 px-5 py-3 text-[13px] items-center cursor-pointer transition-colors ${
                      i % 2 === 0 ? "bg-[#111318]" : "bg-[#0F1016]"
                    } hover:bg-[#161C28] border-b border-[#1E2330] last:border-0`}
                  >
                    <div className="col-span-4 font-medium text-[#F1F5F9] truncate pr-4">{r.name}</div>
                    <div className="col-span-3 text-[#94A3B8] truncate pr-4">{r.artist}</div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full bg-current ${getStatusColor(r.status)}`} />
                      <span className={getStatusColor(r.status)}>{r.status}</span>
                    </div>
                    <div className="col-span-2 text-[#94A3B8]">{r.date}</div>
                    <div className="col-span-1 text-[#94A3B8] truncate">{r.dsp}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart Area */}
            <div className="w-[320px] bg-[#111318] border border-[#1E2330] rounded-md flex flex-col">
              <div className="px-5 py-4 border-b border-[#1E2330]">
                <h2 className="text-[14px] font-medium text-[#F1F5F9]">Доход по месяцам</h2>
              </div>
              <div className="flex-1 p-5 flex items-end justify-between gap-2 h-[200px]">
                {chartData.map((val, i) => {
                  const heightPercent = (val / maxChartValue) * 100;
                  return (
                    <div key={i} className="w-full flex flex-col items-center gap-2 group">
                      <div className="w-full relative h-[140px] flex items-end justify-center">
                        <div
                          className="w-full max-w-[32px] bg-[#3B82F6] rounded-sm opacity-80 group-hover:opacity-100 transition-opacity"
                          style={{ height: \`\${heightPercent}%\` }}
                        />
                      </div>
                      <div className="text-[10px] text-[#475569]">0{i + 1}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: \`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1E2330;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
      \`}} />
    </div>
  );
}

export default DeepDark;
