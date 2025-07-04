import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import HeatMapVisualization from "@/components/HeatMapVisualization";
import { 
  Download, 
  Share, 
  MoreVertical, 
  Eye, 
  Video, 
  Mic,
  Clock,
  CheckCircle,
  AlertCircle,
  RotateCw,
  BarChart3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel
} from "@/components/ui/alert-dialog";

export default function RecentContent() {
  const { data: uploads, isLoading } = useQuery({
    queryKey: ["/api/uploads"],
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const retryMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      const response = await fetch(`/api/uploads/${uploadId}/retry`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${response.status}: ${error}`);
      }

      return response.json();
    },
    onSuccess: (data, uploadId) => {
      toast({
        title: "Retry Started",
        description: "Upload processing has been restarted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/processing-status"] });
      setOpenMenuId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Retry Failed",
        description: error.message || "Failed to retry upload. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    let colorClass = "";
    let icon = <Clock className="w-3 h-3 mr-1" />;
    let text = "Processing";
    switch (status) {
      case 'completed':
        colorClass = "bg-green-100 text-green-800 border-green-200";
        icon = <CheckCircle className="w-3 h-3 mr-1" />;
        text = "Completed";
        break;
      case 'processing':
      case 'transcribing':
      case 'segmenting':
        colorClass = "bg-yellow-100 text-yellow-800 border-yellow-200";
        icon = <Clock className="w-3 h-3 mr-1" />;
        text = "Processing";
        break;
      case 'failed':
        colorClass = "bg-red-100 text-red-800 border-red-200";
        icon = <AlertCircle className="w-3 h-3 mr-1" />;
        text = "Failed";
        break;
      default:
        colorClass = "bg-slate-100 text-slate-600 border-slate-200";
        icon = <Clock className="w-3 h-3 mr-1" />;
        text = "Uploaded";
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}
        style={{ minHeight: 0, minWidth: 0 }}>
        {icon}{text}
      </span>
    );
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('video/')) {
      return <Video className="w-4 h-4 text-blue-500" />;
    } else if (mimeType?.startsWith('audio/')) {
      return <Mic className="w-4 h-4 text-green-500" />;
    }
    return <Video className="w-4 h-4 text-slate-400" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Handlers for action buttons
  const handleDownload = async (upload: any) => {
    if (upload.status !== 'completed') return;
    setLoadingId(upload.id + '-download');
    // For now, just show a toast. Replace with actual download logic.
    await new Promise(r => setTimeout(r, 800));
    toast({ title: "Download", description: `Downloading ${upload.originalName}` });
    setLoadingId(null);
    // window.open(`/api/uploads/${upload.id}/download`, '_blank');
  };

  const handleShare = async (upload: any) => {
    if (upload.status !== 'completed') return;
    setLoadingId(upload.id + '-share');
    const shareUrl = `${window.location.origin}/uploads/${upload.id}`;
    await navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link Copied", description: `Share link copied to clipboard!` });
    setLoadingId(null);
  };

  const handleMore = (upload: any) => {
    setOpenMenuId(openMenuId === upload.id ? null : upload.id);
  };

  const handleRetry = (upload: any) => {
    retryMutation.mutate(upload.id);
  };

  const handleInfo = (upload: any) => {
    // Show detailed error information in a modal or expandable section
    if (upload.errorCode) {
      toast({ 
        title: 'Error Details', 
        description: `Error: ${upload.errorCode}. Check the error display below for recovery steps.`,
        variant: "destructive"
      });
    } else {
      toast({ title: 'Error Details', description: 'No specific error information available.' });
    }
  };

  const handleDelete = (upload: any) => {
    setConfirmDeleteId(upload.id);
    setOpenMenuId(null);
  };

  const confirmDelete = () => {
    toast({ title: 'Deleted', description: 'Delete action coming soon!' });
    setConfirmDeleteId(null);
  };

  const handleHeatMap = (upload: any) => {
    // For now, we'll use the first segment. In a real implementation,
    // you might want to show a list of segments to choose from
    if (upload.segments && upload.segments.length > 0) {
      setSelectedSegmentId(upload.segments[0].id);
    } else {
      toast({ 
        title: 'No Segments', 
        description: 'No segments available for heat map analysis.',
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-white shadow-sm border border-slate-200">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Content</h3>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="content-card animate-pulse">
                <div className="w-20 h-12 bg-slate-200 rounded mr-4"></div>
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded mb-2"></div>
                  <div className="h-3 bg-slate-200 rounded mb-2"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-white shadow-sm border border-slate-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-900">Recent Content</h3>
          <Button variant="ghost" className="text-primary hover:text-blue-700">
            View All
          </Button>
        </div>

        {!uploads || uploads.length === 0 ? (
          <div className="text-center py-8">
            <Video className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No content uploaded yet</p>
            <p className="text-sm text-slate-400 mt-1">Upload your first file to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {uploads.slice(0, 5).map((upload: any) => (
              <div key={upload.id} className="content-card flex items-center">
                <div className="relative mr-4 flex-shrink-0">
                  <div className="w-20 h-12 bg-gradient-to-br from-slate-100 to-slate-200 rounded flex items-center justify-center">
                    {getFileIcon(upload.mimeType)}
                  </div>
                  <div className="absolute -bottom-2 -right-2">
                    {getStatusBadge(upload.status)}
                  </div>
                </div>
                
                <div className="flex-1">
                  <h4 className="font-medium text-slate-900 mb-1">
                    {upload.originalName}
                  </h4>
                  <p className="text-sm text-slate-500 mb-2">
                    {upload.status === 'completed' 
                      ? `Content generated • ${formatFileSize(upload.fileSize)}`
                      : `${upload.status} • ${formatFileSize(upload.fileSize)}`
                    }
                  </p>
                  <div className="flex items-center space-x-4 text-xs text-slate-400">
                    {upload.duration && (
                      <span>{formatDuration(parseFloat(upload.duration))} duration</span>
                    )}
                    <span>{new Date(upload.createdAt).toLocaleDateString()}</span>
                    {upload.status === 'completed' && (
                      <span className="flex items-center">
                        <Eye className="w-3 h-3 mr-1" />
                        Ready for download
                      </span>
                    )}
                    {upload.status === 'failed' && (
                      <span className="flex items-center text-red-500">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Error
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 relative">
                  {/* Download Button with Tooltip and Loading */}
                  <div className="group relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-2 hover:bg-slate-100"
                      disabled={upload.status !== 'completed' || loadingId !== null}
                      onClick={() => handleDownload(upload)}
                      title={upload.status !== 'completed' ? 'Available after processing' : 'Download'}
                    >
                      {loadingId === upload.id + '-download' ? (
                        <RotateCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </Button>
                    {upload.status !== 'completed' && (
                      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-10 z-20 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 shadow">
                        Available after processing
                      </span>
                    )}
                  </div>
                  {/* Share Button with Tooltip and Loading */}
                  <div className="group relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-2 hover:bg-slate-100"
                      disabled={upload.status !== 'completed' || loadingId !== null}
                      onClick={() => handleShare(upload)}
                      title={upload.status !== 'completed' ? 'Available after processing' : 'Copy share link'}
                    >
                      {loadingId === upload.id + '-share' ? (
                        <RotateCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Share className="w-4 h-4" />
                      )}
                    </Button>
                    {upload.status !== 'completed' && (
                      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-10 z-20 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 shadow">
                        Available after processing
                      </span>
                    )}
                  </div>
                  {/* Heat Map Button */}
                  <div className="group relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-2 hover:bg-slate-100"
                      disabled={upload.status !== 'completed' || loadingId !== null}
                      onClick={() => handleHeatMap(upload)}
                      title={upload.status !== 'completed' ? 'Available after processing' : 'View Heat Map'}
                    >
                      <BarChart3 className="w-4 h-4" />
                    </Button>
                    {upload.status !== 'completed' && (
                      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-10 z-20 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 shadow">
                        Available after processing
                      </span>
                    )}
                  </div>
                  {/* More Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 hover:bg-slate-100"
                    onClick={() => handleMore(upload)}
                    title="More actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                  {/* Placeholder menu for More actions */}
                  {openMenuId === upload.id && (
                    <div className="absolute right-0 top-10 z-10 bg-white border border-slate-200 rounded shadow-md p-2 w-32">
                      <button
                        className="block w-full text-left px-2 py-1 text-sm hover:bg-slate-100 rounded"
                        onClick={() => { handleDelete(upload); }}
                      >
                        Delete
                      </button>
                      <button
                        className="block w-full text-left px-2 py-1 text-sm hover:bg-slate-100 rounded"
                        onClick={() => { toast({ title: 'Details', description: 'Details action coming soon!' }); setOpenMenuId(null); }}
                      >
                        Details
                      </button>
                      {upload.status === 'failed' && (
                        <button
                          className="block w-full text-left px-2 py-1 text-sm hover:bg-slate-100 rounded text-red-600 disabled:opacity-50"
                          onClick={() => { handleRetry(upload); setOpenMenuId(null); }}
                          disabled={retryMutation.isPending}
                        >
                          {retryMutation.isPending ? (
                            <>
                              <RotateCw className="w-3 h-3 mr-1 animate-spin inline" />
                              Retrying...
                            </>
                          ) : (
                            'Retry'
                          )}
                        </button>
                      )}
                      {upload.status === 'failed' && (
                        <button
                          className="block w-full text-left px-2 py-1 text-sm hover:bg-slate-100 rounded"
                          onClick={() => { handleInfo(upload); setOpenMenuId(null); }}
                        >
                          Error Info
                        </button>
                      )}
                    </div>
                  )}
                  {/* Delete Confirmation Dialog */}
                  <AlertDialog open={confirmDeleteId === upload.id} onOpenChange={open => { if (!open) setConfirmDeleteId(null); }}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this upload?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. Are you sure you want to delete <span className="font-semibold">{upload.originalName}</span>?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Heat Map Visualization Modal */}
    {selectedSegmentId && (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-auto">
          <HeatMapVisualization 
            segmentId={selectedSegmentId} 
            onClose={() => setSelectedSegmentId(null)} 
          />
        </div>
      </div>
    )}
  </>
  );
}
