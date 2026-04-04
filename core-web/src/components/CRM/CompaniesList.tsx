import { useEffect, useCallback } from 'react';
import { PlusIcon, BuildingOfficeIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { useCrmStore } from '../../stores/crmStore';

interface CompaniesListProps {
  workspaceId: string;
  onCreateNew: () => void;
}

export default function CompaniesList({ workspaceId, onCreateNew }: CompaniesListProps) {
  const { companies, isLoading, fetchCompanies, searchQuery, setSelectedCompany } = useCrmStore();

  const loadCompanies = useCallback(() => {
    fetchCompanies(workspaceId, searchQuery || undefined);
  }, [workspaceId, searchQuery, fetchCompanies]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  if (isLoading && companies.length === 0) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
            <div className="w-9 h-9 rounded-lg bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-36 bg-slate-200 rounded" />
              <div className="h-3 w-24 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Empresas</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
            {companies.length}
          </span>
        </div>
        <button
          onClick={onCreateNew}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Crear empresa
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <BuildingOfficeIcon className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-sm font-medium">Sin empresas</p>
            <p className="text-xs mt-1">Agrega tu primera empresa</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider hidden sm:table-cell">Dominio</th>
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider hidden md:table-cell">Industria</th>
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider hidden lg:table-cell">Empleados</th>
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider hidden xl:table-cell">Ingresos</th>
                <th className="px-4 py-2.5 font-medium text-xs text-slate-500 uppercase tracking-wider hidden xl:table-cell">Responsable</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company: any) => (
                <tr
                  key={company.id}
                  onClick={() => setSelectedCompany(company)}
                  className="border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                        <BuildingOfficeIcon className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-slate-800 truncate">{company.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {company.domain ? (
                      <a
                        href={`https://${company.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
                      >
                        <GlobeAltIcon className="w-3.5 h-3.5" />
                        {company.domain}
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell truncate">
                    {company.industry || '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                    {company.employee_count ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden xl:table-cell">
                    {company.revenue ? `$${Number(company.revenue).toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden xl:table-cell truncate">
                    {company.account_owner || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
