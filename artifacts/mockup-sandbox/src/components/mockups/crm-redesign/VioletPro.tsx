import React from "react";

export function VioletPro() {
  const navGroups = [
    {
      title: "Обзор",
      items: [{ name: "Дашборд", active: true, icon: "m4 6 5 5-5 5-1-1 4-4-4-4 1-1zm6 10h6v-2h-6v2z" }],
    },
    {
      title: "Каталог",
      items: [
        { name: "Каталог", active: false, icon: "M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" },
        { name: "Релизы", active: false, icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" },
        { name: "Артисты", active: false, icon: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" },
      ],
    },
    {
      title: "Дистрибуция",
      items: [
        { name: "Дистрибуция", active: false, icon: "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.36 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" },
        { name: "Доставка DDEX", active: false, icon: "M2.5 19h19v2h-19zm16.84-3.15c.43-.86.1-1.9-.76-2.34L13.1 10.8V3c0-.55-.45-1-1-1s-1 .45-1 1v7.8L5.62 13.51c-.86.43-1.19 1.48-.76 2.34.43.86 1.48 1.19 2.34.76l3.8-1.9V19h2v-4.29l3.8 1.9c.28.14.58.21.88.21.6 0 1.18-.33 1.46-.91z" },
      ],
    },
    {
      title: "Финансы",
      items: [
        { name: "Финансы", active: false, icon: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" },
        { name: "Роялти", active: false, icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.72-2.73 0-2.22-1.9-2.96-3.65-3.46z" },
      ],
    },
    {
      title: "Аналитика",
      items: [
        { name: "Аналитика", active: false, icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" },
        { name: "Плейлисты", active: false, icon: "M4 10h12v2H4zm0-4h16v2H4zm0 8h8v2H4zm10 0v6l5-3z" },
      ],
    },
    {
      title: "CRM",
      items: [
        { name: "CRM", active: false, icon: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" },
        { name: "Коммуникации", active: false, icon: "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" },
      ],
    },
    {
      title: "Система",
      items: [
        { name: "Автоматизация", active: false, icon: "M19.36 10.982c.04-.32.04-.64.04-.98 0-.34-.01-.66-.04-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.488.488 0 0 0 14 0h-4c-.25 0-.46.18-.5.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.05.65-.05.98 0 .33.01.66.05.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-3.04 0-5.5-2.46-5.5-5.5s2.46-5.5 5.5-5.5 5.5 2.46 5.5 5.5-2.46 5.5-5.5 5.5z" },
        { name: "Настройки", active: false, icon: "M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" },
      ],
    },
  ];

  const metrics = [
    { label: "Артисты", value: "142", trend: "+12%" },
    { label: "Релизы", value: "847", trend: "+5%" },
    { label: "Доход", value: "$24 850", trend: "+18%" },
    { label: "Активных треков", value: "3 291", trend: "+8%" },
  ];

  const chartData = [35, 45, 30, 60, 50, 75];
  const chartMax = Math.max(...chartData) * 1.1;

  const releases = [
    { title: "Dard", artist: "Mavzuna", status: "Выпущен", date: "15 Мар 2024", dsp: "Spotify, Apple" },
    { title: "Kuhho", artist: "Safar", status: "В обработке", date: "18 Мар 2024", dsp: "Yandex, VK" },
    { title: "Bozgasht", artist: "Farzona", status: "Выпущен", date: "10 Мар 2024", dsp: "Все площадки" },
    { title: "Ishqi Tu", artist: "Rustam", status: "Черновик", date: "—", dsp: "—" },
    { title: "Zindagi", artist: "Nigina", status: "Ошибка", date: "22 Мар 2024", dsp: "Spotify" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Выпущен": return { bg: "rgba(16, 185, 129, 0.15)", text: "#34D399" };
      case "В обработке": return { bg: "rgba(245, 158, 11, 0.15)", text: "#FBBF24" };
      case "Черновик": return { bg: "rgba(156, 163, 175, 0.15)", text: "#9CA3AF" };
      case "Ошибка": return { bg: "rgba(239, 68, 68, 0.15)", text: "#F87171" };
      default: return { bg: "rgba(156, 163, 175, 0.15)", text: "#9CA3AF" };
    }
  };

  return (
    <div style={{ backgroundColor: "#0F0B1A", color: "#EDE9FE", fontFamily: "system-ui, sans-serif" }} className="flex h-[800px] w-full overflow-hidden text-sm">
      
      {/* Sidebar */}
      <div 
        style={{ 
          width: "220px", 
          background: "linear-gradient(180deg, #120D22 0%, #0F0B1A 100%)",
          borderRight: "1px solid #2D1F4E"
        }} 
        className="flex-shrink-0 flex flex-col h-full"
      >
        <div className="p-5 flex items-center gap-2">
          <div style={{ backgroundColor: "#8B5CF6" }} className="w-6 h-6 rounded flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          </div>
          <span className="font-bold text-base tracking-wide">Tajik Music</span>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-3 space-y-6 scrollbar-hide">
          {navGroups.map((group, i) => (
            <div key={i}>
              <div style={{ color: "#6D28D9", fontSize: "10px" }} className="uppercase font-bold tracking-widest mb-2 px-3">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item, j) => (
                  <div 
                    key={j} 
                    style={{ 
                      backgroundColor: item.active ? "rgba(139,92,246,0.12)" : "transparent",
                      color: item.active ? "#A78BFA" : "#9CA3AF"
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:text-[#EDE9FE] transition-colors relative"
                  >
                    {item.active && (
                      <div style={{ backgroundColor: "#8B5CF6" }} className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full" />
                    )}
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d={item.icon}/>
                    </svg>
                    <span className="font-medium">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header 
          style={{ borderBottom: "1px solid #2D1F4E", backgroundColor: "#0F0B1A" }} 
          className="h-12 flex-shrink-0 flex items-center justify-between px-8 z-10"
        >
          <h1 className="text-lg font-semibold tracking-wide">Дашборд</h1>
          <div className="flex items-center gap-4">
            <button style={{ color: "#9CA3AF" }} className="hover:text-[#EDE9FE]">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#3B82F6] p-0.5">
                <div className="w-full h-full rounded-full bg-[#170F2A] border border-[#2D1F4E] flex items-center justify-center">
                  <span className="text-xs font-bold">TM</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            
            {/* Top row: Metrics */}
            <div className="grid grid-cols-4 gap-6">
              {metrics.map((m, i) => (
                <div 
                  key={i} 
                  style={{ 
                    backgroundColor: "#1A1030", 
                    borderColor: "#2D1F4E",
                    borderLeftColor: "#8B5CF6",
                    borderLeftWidth: "3px"
                  }} 
                  className="rounded-lg p-5 border shadow-sm relative overflow-hidden"
                >
                  <div style={{ color: "#9CA3AF" }} className="text-xs font-medium mb-1">{m.label}</div>
                  <div className="text-2xl font-bold">{m.value}</div>
                  <div style={{ color: "#34D399" }} className="text-xs mt-2 font-medium">{m.trend} за месяц</div>
                </div>
              ))}
            </div>

            {/* Middle row: Chart & Quick actions */}
            <div className="grid grid-cols-3 gap-6">
              <div 
                style={{ backgroundColor: "#170F2A", borderColor: "#2D1F4E" }} 
                className="col-span-2 rounded-lg border p-6"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-semibold text-base">Доход по месяцам</h2>
                  <div style={{ color: "#9CA3AF" }} className="text-xs font-medium">Последние 6 месяцев</div>
                </div>
                
                <div className="h-48 flex items-end justify-between gap-4 pt-4">
                  {chartData.map((val, i) => {
                    const heightPercent = (val / chartMax) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                        <div className="w-full relative h-full flex flex-col justify-end">
                          <div 
                            className="w-full rounded-t-sm transition-all duration-300 group-hover:opacity-80"
                            style={{ 
                              height: `${heightPercent}%`,
                              background: "linear-gradient(180deg, #C4B5FD 0%, #8B5CF6 100%)"
                            }}
                          />
                        </div>
                        <div style={{ color: "#9CA3AF" }} className="text-[10px] uppercase font-bold">
                          {['Окт', 'Ноя', 'Дек', 'Янв', 'Фев', 'Мар'][i]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div 
                style={{ backgroundColor: "#170F2A", borderColor: "#2D1F4E" }} 
                className="col-span-1 rounded-lg border p-6 flex flex-col"
              >
                <h2 className="font-semibold text-base mb-6">Быстрые действия</h2>
                <div className="space-y-3 flex-1">
                  <button 
                    style={{ backgroundColor: "#8B5CF6" }} 
                    className="w-full py-2.5 rounded-md font-medium text-white hover:bg-[#7C3AED] transition-colors shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                  >
                    Создать релиз
                  </button>
                  <button 
                    style={{ backgroundColor: "transparent", borderColor: "#2D1F4E", color: "#EDE9FE" }} 
                    className="w-full py-2.5 rounded-md font-medium border hover:bg-[#22163A] transition-colors"
                  >
                    Добавить артиста
                  </button>
                  <button 
                    style={{ backgroundColor: "transparent", borderColor: "#2D1F4E", color: "#EDE9FE" }} 
                    className="w-full py-2.5 rounded-md font-medium border hover:bg-[#22163A] transition-colors"
                  >
                    Импорт отчета
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom row: Table */}
            <div 
              style={{ backgroundColor: "#170F2A", borderColor: "#2D1F4E" }} 
              className="rounded-lg border overflow-hidden"
            >
              <div className="p-5 border-b" style={{ borderColor: "#2D1F4E" }}>
                <h2 className="font-semibold text-base">Новые релизы</h2>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ color: "#9CA3AF", borderBottom: "1px solid #2D1F4E" }}>
                      <th className="font-medium p-4 text-xs uppercase tracking-wider">Релиз</th>
                      <th className="font-medium p-4 text-xs uppercase tracking-wider">Артист</th>
                      <th className="font-medium p-4 text-xs uppercase tracking-wider">Статус</th>
                      <th className="font-medium p-4 text-xs uppercase tracking-wider">Дата</th>
                      <th className="font-medium p-4 text-xs uppercase tracking-wider">DSP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((rel, i) => {
                      const statusStyle = getStatusColor(rel.status);
                      return (
                        <tr 
                          key={i} 
                          className="transition-colors group"
                          style={{ borderBottom: i === releases.length - 1 ? "none" : "1px solid #2D1F4E" }}
                        >
                          <td className="p-4 group-hover:bg-[#22163A]">
                            <span className="font-medium text-[#EDE9FE]">{rel.title}</span>
                          </td>
                          <td className="p-4 group-hover:bg-[#22163A]">
                            <span style={{ color: "#A78BFA" }}>{rel.artist}</span>
                          </td>
                          <td className="p-4 group-hover:bg-[#22163A]">
                            <span 
                              style={{ 
                                backgroundColor: statusStyle.bg,
                                color: statusStyle.text
                              }} 
                              className="px-2.5 py-1 rounded-full text-xs font-semibold"
                            >
                              {rel.status}
                            </span>
                          </td>
                          <td className="p-4 group-hover:bg-[#22163A]">
                            <span style={{ color: "#9CA3AF" }}>{rel.date}</span>
                          </td>
                          <td className="p-4 group-hover:bg-[#22163A]">
                            <span style={{ color: "#9CA3AF" }}>{rel.dsp}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  );
}
