import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { showErrorDialog } from '@/lib/errorDialog';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { mergePrintLayout, type PrintLayout } from '@/db/printLayout';
import type { ClinicSettings, ReportWithDetails } from '@/lib/types';
import PrintTemplateContent from '@/components/print/PrintTemplateContent';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function PrintReport() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [report, setReport] = useState<ReportWithDetails | null>(null);
  const [clinic, setClinic] = useState<ClinicSettings | null>(null);
  const [layout, setLayout] = useState<PrintLayout>(mergePrintLayout(undefined));
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const autoPrinted = useRef(false);

  const load = useCallback(async () => {
    try {
      const [r, s, l] = await Promise.all([api.reports.getById(Number(id)), api.settings.get(), api.settings.getPrintLayout()]);
      if (!r) {
        showErrorDialog('Report not found.');
        return;
      }
      setReport(r);
      setClinic(s);
      setLayout(mergePrintLayout(l));
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to load report.');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const canFinalize = user?.role === 'ADMIN' || user?.role === 'TECHNICIAN';

  const handlePrint = useCallback(
    async (mode: 'paper' | 'pdf') => {
      if (!report) return;
      const wasDraft = report.status === 'DRAFT';
      setBusy('print');
      try {
        const result = await api.print.report(report.id, mode);
        if (result.success) {
          await load();
          if (result.fellBackToPdf) {
            toast.warning(`Direct printing failed (${result.error}). Opened the PDF instead — print it from there.`);
          } else {
            const target = result.printer ? `"${result.printer}"` : 'printer';
            toast.success(wasDraft ? `Report finalized and sent to ${target}.` : `Sent to ${target}.`);
          }
        }
      } catch (err) {
        showErrorDialog(err instanceof Error ? err.message : 'Failed to print.');
      } finally {
        setBusy(null);
      }
    },
    [report, load]
  );

  const handleSavePdf = async () => {
    if (!report) return;
    setBusy('pdf');
    try {
      const result = await api.print.savePdf(report.id);
      if (result.canceled) return;
      if (result.success) {
        toast.success(`PDF saved${result.path ? ` to ${result.path}` : ''}.`);
      } else if (result.error) {
        showErrorDialog(result.error);
      }
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to save PDF.');
    } finally {
      setBusy(null);
    }
  };

  // A finalized report's PDF can be missing (never archived, or the file
  // was later moved/deleted) — rather than a bare "file not found" dead
  // end, this offers the fix right in the toast: regenerate it from the
  // report's own already-locked data, then the next Open PDF/Open Folder
  // click works normally.
  const regeneratePdf = async () => {
    if (!report) return;
    try {
      await api.reports.retryArchive(report.id);
      await load();
      toast.success('PDF regenerated.');
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to regenerate the PDF.');
    }
  };

  const handleOpenPdf = async () => {
    if (!report) return;
    try {
      const result = await api.print.openPdf(report.id);
      if (!result.success && result.missingPdf) {
        toast.error('PDF file not found for this report.', { action: { label: 'Regenerate', onClick: regeneratePdf } });
      }
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to open PDF.');
    }
  };

  const handleOpenFolder = async () => {
    if (!report) return;
    try {
      const result = await api.print.openFolder(report.id);
      if (!result.success && result.missingPdf) {
        toast.error('PDF file not found for this report.', { action: { label: 'Regenerate', onClick: regeneratePdf } });
      }
    } catch (err) {
      showErrorDialog(err instanceof Error ? err.message : 'Failed to open folder.');
    }
  };

  // Lets "Finalize & Print" on the New Report page (which already finalizes
  // before navigating here) land straight in the print dialog, instead of
  // requiring a second click.
  useEffect(() => {
    if (!report || autoPrinted.current) return;
    if (searchParams.get('autoprint') === '1' && report.status === 'FINALIZED') {
      autoPrinted.current = true;
      handlePrint('paper');
    }
  }, [report, searchParams, handlePrint]);

  // Ctrl+P prints/reprints the report currently on screen — same
  // finalize-if-draft gating as the button itself, including the same
  // confirmation before permanently locking a draft.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'p') return;
      e.preventDefault();
      if (!report || busy !== null) return;
      if (report.status === 'DRAFT') {
        if (!canFinalize) return;
        setFinalizeConfirmOpen(true);
        return;
      }
      handlePrint('paper');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [report, busy, canFinalize, handlePrint]);

  if (!report || !clinic) {
    return <div className="p-8 text-muted-foreground">Loading report…</div>;
  }

  const isDraft = report.status === 'DRAFT';
  const printDisabled = busy !== null || (isDraft && !canFinalize);

  return (
    <div className="min-h-screen bg-secondary/30">
      <div className="no-print sticky top-0 bg-background border-b border-border px-8 py-4 flex items-center justify-between flex-wrap gap-3">
        {/* Goes back to wherever the user actually came from — Reports
            History for a finalized report opened from that list, or the
            New Report edit screen when reached via "Preview" on a draft.
            A fixed destination here previously always sent you to the
            Reports History list even when you'd come from editing a
            draft, dropping you out of the report you were working on. */}
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-primary hover:underline"
        >
          &larr; Back
        </button>
        <div className="flex items-center gap-3">
          {isDraft ? (
            <Badge variant="warning">Draft — will be locked on print</Badge>
          ) : (
            <Badge variant="success">
              LOCKED — finalized {report.finalized_at ? report.finalized_at.slice(0, 10) : ''}
              {report.finalized_by_name ? ` by ${report.finalized_by_name}` : ''}
            </Badge>
          )}
          {isDraft ? (
            <>
              <Button
                variant="outline"
                onClick={handleSavePdf}
                disabled={busy !== null || !canFinalize}
                title={!canFinalize ? 'Only an admin or technician can finalize' : undefined}
              >
                {busy === 'pdf' ? 'Saving…' : 'Save as PDF'}
              </Button>
              <Button
                onClick={() => setFinalizeConfirmOpen(true)}
                disabled={printDisabled}
                title={!canFinalize ? 'Only an admin or technician can finalize' : undefined}
              >
                {busy === 'print' ? 'Finalizing…' : 'Finalize & Print'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleOpenFolder} disabled={busy !== null}>
                Open Folder
              </Button>
              <Button variant="outline" onClick={handleOpenPdf} disabled={busy !== null}>
                Open PDF
              </Button>
              <Button onClick={() => handlePrint('paper')} disabled={busy !== null}>
                {busy === 'print' ? 'Printing…' : 'Reprint'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto bg-white my-8 p-10 shadow-sm print:shadow-none print:my-0" id="print-area">
        <PrintTemplateContent report={report} clinic={clinic} layout={layout} mode="pdf" showInlineHeaderFooterImages />
      </div>

      <AlertDialog open={finalizeConfirmOpen} onOpenChange={setFinalizeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize this report?</AlertDialogTitle>
            <AlertDialogDescription>After finalizing, this report cannot be edited or deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setFinalizeConfirmOpen(false);
                handlePrint('paper');
              }}
            >
              Finalize & Print
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
