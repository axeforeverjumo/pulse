import { useState, useEffect, useMemo } from 'react';
import { CheckIcon, ArrowPathIcon, EyeIcon, CodeBracketIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useEmailAccountsStore } from '../../stores/emailAccountsStore';
import type { EmailAccount } from '../../api/client';

const DEFAULT_TEMPLATE = `<table cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <tr>
    <td style="padding-right: 15px; border-right: 2px solid #00A3FF;">
      <img src="https://pulse.factoriaia.com/factoria-logo.png" alt="Factoria IA" style="width: 80px; height: auto;" />
    </td>
    <td style="padding-left: 15px;">
      <strong style="font-size: 15px; color: #111;">{{nombre}}</strong><br/>
      <span style="color: #00A3FF;">{{cargo}}</span><br/>
      <span style="font-size: 12px; color: #666;">
        {{telefono}}<br/>
        {{email}}<br/>
        factoriaia.com
      </span>
    </td>
  </tr>
</table>`;

interface Props {
  accounts: EmailAccount[];
}

export default function EmailSignatureEditor({ accounts }: Props) {
  const { updateSignature } = useEmailAccountsStore();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [signatureHtml, setSignatureHtml] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  // Quick setup fields
  const [nombre, setNombre] = useState('');
  const [cargo, setCargo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  // Select first account by default
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Load signature when account changes
  useEffect(() => {
    if (selectedAccount) {
      setSignatureHtml(selectedAccount.email_signature || '');
      setHasChanges(false);
    }
  }, [selectedAccount]);

  const handleSignatureChange = (value: string) => {
    setSignatureHtml(value);
    setHasChanges(value !== (selectedAccount?.email_signature || ''));
  };

  const handleApplyTemplate = () => {
    let html = DEFAULT_TEMPLATE;
    html = html.replace('{{nombre}}', nombre || 'Tu nombre');
    html = html.replace('{{cargo}}', cargo || 'Tu cargo');
    html = html.replace('{{telefono}}', telefono || '+34 600 000 000');
    html = html.replace('{{email}}', email || selectedAccount?.provider_email || 'email@example.com');
    handleSignatureChange(html);
  };

  const handleSave = async () => {
    if (!selectedAccountId) return;
    setIsSaving(true);
    try {
      await updateSignature(selectedAccountId, signatureHtml);
      setHasChanges(false);
      toast.success('Firma guardada correctamente');
    } catch {
      toast.error('Error al guardar la firma');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    handleSignatureChange('');
  };

  if (accounts.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-text-body mb-4">Firma de correo</h2>

      {/* Account selector (if multiple) */}
      {accounts.length > 1 && (
        <div className="mb-4">
          <label className="text-xs text-text-secondary mb-1 block">Cuenta</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full text-sm border border-border-gray rounded-lg px-3 py-2 bg-bg-white text-text-body focus:outline-none focus:border-text-tertiary"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.provider_email}
                {a.is_primary ? ' (Principal)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Quick setup template */}
      <div className="mb-4 p-3 bg-bg-gray-dark/30 rounded-lg border border-border-gray">
        <div className="flex items-center gap-2 mb-3">
          <SparklesIcon className="w-4 h-4 text-text-secondary" />
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">Plantilla rapida</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input
            type="text"
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="text-sm border border-border-gray rounded px-2.5 py-1.5 bg-bg-white text-text-body placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary"
          />
          <input
            type="text"
            placeholder="Cargo"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            className="text-sm border border-border-gray rounded px-2.5 py-1.5 bg-bg-white text-text-body placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary"
          />
          <input
            type="text"
            placeholder="Telefono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="text-sm border border-border-gray rounded px-2.5 py-1.5 bg-bg-white text-text-body placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary"
          />
          <input
            type="text"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-sm border border-border-gray rounded px-2.5 py-1.5 bg-bg-white text-text-body placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary"
          />
        </div>
        <button
          onClick={handleApplyTemplate}
          className="text-xs text-text-secondary hover:text-text-body border border-border-gray rounded px-3 py-1.5 hover:bg-bg-gray-dark/50 transition-colors"
        >
          Aplicar plantilla
        </button>
      </div>

      {/* Toggle buttons */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setShowPreview(false)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors ${
            !showPreview
              ? 'bg-bg-gray-dark text-text-body'
              : 'text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50'
          }`}
        >
          <CodeBracketIcon className="w-3.5 h-3.5" />
          HTML
        </button>
        <button
          onClick={() => setShowPreview(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors ${
            showPreview
              ? 'bg-bg-gray-dark text-text-body'
              : 'text-text-secondary hover:text-text-body hover:bg-bg-gray-dark/50'
          }`}
        >
          <EyeIcon className="w-3.5 h-3.5" />
          Vista previa
        </button>
      </div>

      {/* Editor / Preview */}
      {showPreview ? (
        <div
          className="min-h-[120px] max-h-[200px] overflow-y-auto border border-border-gray rounded-lg p-4 bg-white"
          dangerouslySetInnerHTML={{ __html: signatureHtml || '<p style="color:#999;font-size:13px;">Sin firma configurada</p>' }}
        />
      ) : (
        <textarea
          value={signatureHtml}
          onChange={(e) => handleSignatureChange(e.target.value)}
          placeholder="<table>...</table>"
          className="w-full min-h-[120px] max-h-[200px] text-xs font-mono border border-border-gray rounded-lg p-3 bg-bg-white text-text-body placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary resize-y"
          spellCheck={false}
        />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-primary text-text-light rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isSaving ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
          ) : (
            <CheckIcon className="w-4 h-4" />
          )}
          {isSaving ? 'Guardando...' : 'Guardar firma'}
        </button>
        {signatureHtml && (
          <button
            onClick={handleClear}
            className="px-3 py-2 text-sm text-text-secondary hover:text-red-500 transition-colors"
          >
            Eliminar firma
          </button>
        )}
      </div>
    </div>
  );
}
