import { useState } from "react";
import {
  ChartBarIcon,
  MagnifyingGlassCircleIcon,
  ShieldCheckIcon,
  BoltIcon,
  Cog6ToothIcon,
  PresentationChartLineIcon,
} from "@heroicons/react/24/outline";
import OverviewTab from "./tabs/OverviewTab";
import AnalyticsTab from "./tabs/AnalyticsTab";
import SearchConsoleTab from "./tabs/SearchConsoleTab";
import AuditTab from "./tabs/AuditTab";
import PageSpeedTab from "./tabs/PageSpeedTab";

const tabs = [
  { id: "overview" as const, label: "Resumen", icon: PresentationChartLineIcon },
  { id: "analytics" as const, label: "Analytics", icon: ChartBarIcon },
  { id: "search" as const, label: "Search Console", icon: MagnifyingGlassCircleIcon },
  { id: "audit" as const, label: "SEO Audit", icon: ShieldCheckIcon },
  { id: "pagespeed" as const, label: "PageSpeed", icon: BoltIcon },
];

type TabId = (typeof tabs)[number]["id"];

interface Props {
  site: any;
  workspaceId: string;
  onUpdated: (site: any) => void;
  onDeleted: (id: string) => void;
}

export default function SiteDetail({
  site,
  workspaceId,
  onUpdated,
  onDeleted,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="flex flex-col h-full">
      {/* Site header */}
      <div className="px-6 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{site.name}</h2>
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:underline"
            >
              {site.domain}
            </a>
          </div>
          <div className="flex items-center gap-2">
            {site.site_type && (
              <span className="text-xs px-2 py-1 rounded bg-white/10 text-white/60">
                {site.site_type}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-white/50 hover:text-white/70"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "overview" && (
          <OverviewTab site={site} workspaceId={workspaceId} />
        )}
        {activeTab === "analytics" && (
          <AnalyticsTab site={site} workspaceId={workspaceId} />
        )}
        {activeTab === "search" && (
          <SearchConsoleTab site={site} workspaceId={workspaceId} />
        )}
        {activeTab === "audit" && (
          <AuditTab
            site={site}
            workspaceId={workspaceId}
            onSiteUpdated={onUpdated}
          />
        )}
        {activeTab === "pagespeed" && (
          <PageSpeedTab site={site} workspaceId={workspaceId} />
        )}
      </div>
    </div>
  );
}
