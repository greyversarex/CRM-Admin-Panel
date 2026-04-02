import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  useGetDashboardSummary, 
  useGetDashboardRevenueByMonth, 
  useGetDashboardRecentActivity, 
  useGetDashboardTopArtists, 
  useGetDashboardReleasesByStatus 
} from "@workspace/api-client-react";
import { Users, Disc3, Music, DollarSign, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: revenueData, isLoading: isRevenueLoading } = useGetDashboardRevenueByMonth();
  const { data: activityData, isLoading: isActivityLoading } = useGetDashboardRecentActivity();
  const { data: topArtistsData, isLoading: isTopArtistsLoading } = useGetDashboardTopArtists();
  const { data: statusData, isLoading: isStatusLoading } = useGetDashboardReleasesByStatus();

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time overview of your music catalog and operations.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">${summary?.totalRevenue.toLocaleString() ?? "0"}</div>
                  <p className="text-xs text-emerald-500 mt-1 flex items-center">
                    +{summary?.revenueGrowth}% from last month
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Artists</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{summary?.totalArtists.toLocaleString() ?? "0"}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Releases</CardTitle>
              <Disc3 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{summary?.totalReleases.toLocaleString() ?? "0"}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary?.releasesThisMonth} new this month
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Deliveries</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{summary?.activeDeliveries.toLocaleString() ?? "0"}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4 bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Revenue Overview</CardTitle>
              <CardDescription>DSP vs Publishing revenue by month</CardDescription>
            </CardHeader>
            <CardContent className="pl-0">
              {isRevenueLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Skeleton className="h-full w-full ml-6 rounded-md" />
                </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={revenueData || []}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorDsp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPub" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickFormatter={(value) => `$${value}`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Area type="monotone" dataKey="dspRevenue" name="DSP Revenue" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorDsp)" />
                      <Area type="monotone" dataKey="publishingRevenue" name="Publishing Revenue" stroke="hsl(var(--chart-2))" fillOpacity={1} fill="url(#colorPub)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="col-span-3 bg-card/50 backdrop-blur border-border/50 flex flex-col">
            <CardHeader>
              <CardTitle>Top Artists</CardTitle>
              <CardDescription>By streams this month</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {isTopArtistsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {topArtistsData?.map((artist) => (
                    <div key={artist.id} className="flex items-center">
                      <Avatar className="h-10 w-10 border border-border">
                        <AvatarImage src={artist.imageUrl || ""} alt={artist.name} />
                        <AvatarFallback className="bg-primary/20 text-primary">{artist.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="ml-4 space-y-1 flex-1">
                        <p className="text-sm font-medium leading-none">{artist.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {artist.totalStreams.toLocaleString()} streams
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">${artist.revenue.toLocaleString()}</p>
                        <p className={`text-xs ${artist.trend > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {artist.trend > 0 ? "+" : ""}{artist.trend}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-3 bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Releases by Status</CardTitle>
            </CardHeader>
            <CardContent>
              {isStatusLoading ? (
                <div className="h-[250px] flex items-center justify-center">
                  <Skeleton className="h-full w-full rounded-md" />
                </div>
              ) : (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={statusData || []}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="status" 
                        type="category" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickFormatter={(value) => value.replace(/_/g, " ")}
                      />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="col-span-4 bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {isActivityLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex space-x-4">
                      <Skeleton className="h-2 w-2 mt-2 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-1 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {activityData?.map((item) => (
                    <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-2 h-2 rounded-full bg-primary border-4 border-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow z-10"></div>
                      <div className="w-[calc(100%-1rem)] md:w-[calc(50%-1.5rem)] p-4 rounded border border-border bg-card/50 backdrop-blur shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-sm">{item.title}</h4>
                          <time className="text-xs text-muted-foreground">{new Date(item.timestamp).toLocaleDateString()}</time>
                        </div>
                        <div className="text-sm text-muted-foreground">{item.description}</div>
                      </div>
                    </div>
                  ))}
                  {(!activityData || activityData.length === 0) && (
                    <div className="text-center text-muted-foreground text-sm py-4">No recent activity found.</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}