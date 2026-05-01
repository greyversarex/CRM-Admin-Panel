import React from 'react';

const sidebarGroups = [
  {
    title: 'Обзор',
    items: [{ label: 'Дашборд', active: true }],
  },
  {
    title: 'Каталог',
    items: [{ label: 'Каталог' }, { label: 'Релизы' }, { label: 'Артисты' }],
  },
  {
    title: 'Дистрибуция',
    items: [{ label: 'Дистрибуция' }, { label: 'Доставка DDEX' }],
  },
  {
    title: 'Финансы',
    items: [{ label: 'Финансы' }, { label: 'Роялти' }],
  },
  {
    title: 'Аналитика',
    items: [{ label: 'Аналитика' }, { label: 'Плейлисты' }],
  },
  {
    title: 'CRM',
    items: [{ label: 'CRM' }, { label: 'Коммуникации' }],
  },
  {
    title: 'Система',
    items: [{ label: 'Автоматизация' }, { label: 'Настройки' }],
  },
];

const metrics = [
  { label: 'Артисты', value: '142', trendColor: '#10B981' },
  { label: 'Релизы', value: '847', trendColor: '#3B82F6' },
  { label: 'Доход', value: '$24 850', trendColor: '#F59E0B' },
  { label: 'Активных треков', value: '3 291', trendColor: '#EF4444' },
];

const tableData = [
  { release: 'Sadoyi Dil', artist: 'Nigina Amonqulova', status: 'Выпущен', date: '2023-10-15', dsp: 'Spotify, Apple' },
  { release: 'Modar', artist: 'Jonibek Murodov', status: 'В обработке', date: '2023-10-20', dsp: 'All Platforms' },
  { release: 'Bazam', artist: 'Shabnami Surayo', status: 'Черновик', date: '2023-11-01', dsp: '-' },
  { release: 'Falak', artist: 'Valijon Azizov', status: 'Выпущен', date: '2023-09-28', dsp: 'Spotify, Yandex' },
  { release: 'Ishq', artist: 'Zulaykho Mahmadshoeva', status: 'Ошибка', date: '2023-10-18', dsp: 'Apple Music' },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Выпущен': return '#10B981';
    case 'В обработке': return '#F59E0B';
    case 'Черновик': return '#64748B';
    case 'Ошибка': return '#EF4444';
    default: return '#64748B';
  }
};

export const EmeraldDark = () => {
  return (
    <div style={{ backgroundColor: '#050F0A', color: '#D1FAE5', fontFamily: 'system-ui, sans-serif' }} className="flex h-screen w-full overflow-hidden text-sm">
      {/* Sidebar */}
      <div style={{ backgroundColor: '#040C08', borderColor: '#0D2E1E' }} className="w-[220px] flex-shrink-0 border-r flex flex-col">
        <div className="h-10 flex items-center px-4 font-bold tracking-wider" style={{ color: '#10B981' }}>
          TAJIK MUSIC
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {sidebarGroups.map((group, idx) => (
            <div key={idx} className="mb-4">
              <div style={{ color: '#065F46' }} className="px-4 mb-1 text-[10px] font-bold uppercase tracking-wider">
                {group.title}
              </div>
              <div>
                {group.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: item.active ? 'rgba(16,185,129,0.08)' : 'transparent',
                      borderLeftColor: item.active ? '#10B981' : 'transparent'
                    }}
                    className={`px-4 py-1.5 flex items-center cursor-pointer border-l-2 hover:bg-white/5 transition-colors`}
                  >
                    <div style={{ color: item.active ? '#34D399' : '#64748B' }}>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div style={{ borderColor: '#0D2E1E' }} className="h-10 border-b flex items-center justify-between px-6 flex-shrink-0">
          <div className="font-semibold" style={{ color: '#6EE7B7' }}>Дашборд</div>
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-6 h-6 rounded-full bg-emerald-900/50 flex items-center justify-center text-xs text-emerald-400 border border-emerald-800">
              U
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          
          {/* Metrics */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {metrics.map((metric, idx) => (
              <div key={idx} style={{ backgroundColor: '#061410', borderColor: '#0D2E1E' }} className="border rounded relative overflow-hidden p-4 flex flex-col justify-between h-24">
                <div style={{ color: '#64748B' }} className="text-xs uppercase tracking-wider">{metric.label}</div>
                <div style={{ color: '#D1FAE5', fontFamily: 'JetBrains Mono, monospace' }} className="text-2xl font-light">
                  {metric.value}
                </div>
                <div style={{ backgroundColor: metric.trendColor }} className="absolute bottom-0 left-0 right-0 h-[2px]" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Table */}
            <div className="col-span-2">
              <div style={{ borderColor: '#0D2E1E' }} className="border-b pb-2 mb-4">
                <h2 style={{ color: '#6EE7B7' }} className="font-medium tracking-wide uppercase text-xs">Новые релизы</h2>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th style={{ color: '#64748B', borderColor: '#0D2E1E' }} className="py-2 px-2 border-b font-medium text-xs">Релиз</th>
                    <th style={{ color: '#64748B', borderColor: '#0D2E1E' }} className="py-2 px-2 border-b font-medium text-xs">Артист</th>
                    <th style={{ color: '#64748B', borderColor: '#0D2E1E' }} className="py-2 px-2 border-b font-medium text-xs">Статус</th>
                    <th style={{ color: '#64748B', borderColor: '#0D2E1E' }} className="py-2 px-2 border-b font-medium text-xs">Дата</th>
                    <th style={{ color: '#64748B', borderColor: '#0D2E1E' }} className="py-2 px-2 border-b font-medium text-xs">DSP</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ borderColor: '#0D2E1E' }} className="py-2 px-2 border-b">{row.release}</td>
                      <td style={{ borderColor: '#0D2E1E', color: '#6EE7B7' }} className="py-2 px-2 border-b">{row.artist}</td>
                      <td style={{ borderColor: '#0D2E1E' }} className="py-2 px-2 border-b flex items-center gap-2">
                        <span style={{ backgroundColor: getStatusColor(row.status) }} className="w-1.5 h-1.5 rounded-full inline-block" />
                        <span style={{ color: getStatusColor(row.status) }}>{row.status}</span>
                      </td>
                      <td style={{ borderColor: '#0D2E1E', fontFamily: 'JetBrains Mono, monospace' }} className="py-2 px-2 border-b text-xs">{row.date}</td>
                      <td style={{ borderColor: '#0D2E1E', color: '#64748B' }} className="py-2 px-2 border-b text-xs">{row.dsp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Chart */}
            <div className="col-span-1">
              <div style={{ borderColor: '#0D2E1E' }} className="border-b pb-2 mb-4">
                <h2 style={{ color: '#6EE7B7' }} className="font-medium tracking-wide uppercase text-xs">Доход по месяцам</h2>
              </div>
              <div style={{ backgroundColor: '#061410', borderColor: '#0D2E1E' }} className="border rounded p-4 h-48 flex items-end justify-center relative">
                <svg viewBox="0 0 300 100" className="w-full h-full overflow-visible">
                  <path 
                    d="M0,80 L50,60 L100,70 L150,40 L200,50 L250,20 L300,10" 
                    fill="none" 
                    stroke="#10B981" 
                    strokeWidth="2" 
                  />
                  {[
                    { x: 0, y: 80 }, { x: 50, y: 60 }, { x: 100, y: 70 }, 
                    { x: 150, y: 40 }, { x: 200, y: 50 }, { x: 250, y: 20 }, { x: 300, y: 10 }
                  ].map((pt, i) => (
                    <circle key={i} cx={pt.x} cy={pt.y} r="4" fill="#050F0A" stroke="#10B981" strokeWidth="2" />
                  ))}
                </svg>
                <div className="absolute bottom-0 w-full flex justify-between text-[10px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono, monospace' }}>
                  <span>Jan</span>
                  <span>Feb</span>
                  <span>Mar</span>
                  <span>Apr</span>
                  <span>May</span>
                  <span>Jun</span>
                  <span>Jul</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default EmeraldDark;
