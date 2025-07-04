import React from 'react';
import { AlertTriangle, RefreshCw, X, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Badge } from './badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';

export interface ErrorInfo {
  code: string;
  message: string;
  recoverySteps: string[];
  isRetryable: boolean;
  errorId?: string;
}

interface ErrorDisplayProps {
  error: ErrorInfo;
  onRetry?: () => void;
  onDismiss?: () => void;
  showTechnicalDetails?: boolean;
  className?: string;
  variant?: 'inline' | 'card' | 'toast';
  isLoading?: boolean;
}

export function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  showTechnicalDetails = false,
  className = '',
  variant = 'card',
  isLoading = false
}: ErrorDisplayProps) {
  const [isExpanded, setIsExpanded] = React.useState(showTechnicalDetails);

  const getSeverityColor = (code: string) => {
    if (code.includes('CRITICAL') || code.includes('AUTH')) return 'destructive';
    if (code.includes('UPLOAD') || code.includes('PROCESSING')) return 'default';
    return 'secondary';
  };

  const getSeverityIcon = (code: string) => {
    if (code.includes('CRITICAL') || code.includes('AUTH')) return <AlertTriangle className="w-4 h-4" />;
    return <HelpCircle className="w-4 h-4" />;
  };

  const renderInline = () => (
    <div className={`flex items-start space-x-2 p-2 bg-red-50 border border-red-200 rounded-md ${className}`}>
      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800">{error.message}</p>
        {error.recoverySteps.length > 0 && (
          <div className="mt-1">
            <p className="text-xs text-red-600 font-medium">How to fix:</p>
            <ul className="text-xs text-red-600 mt-1 space-y-0.5">
              {error.recoverySteps.slice(0, 2).map((step, index) => (
                <li key={index} className="flex items-start">
                  <span className="mr-1">•</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error.isRetryable && onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isLoading}
            className="mt-2 h-6 px-2 text-xs text-red-700 hover:text-red-800 hover:bg-red-100"
          >
            {isLoading ? (
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Try Again
          </Button>
        )}
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-100"
        >
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  );

  const renderCard = () => (
    <Card className={`border-red-200 bg-red-50 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getSeverityIcon(error.code)}
            <CardTitle className="text-red-800 text-base">Error</CardTitle>
            <Badge variant={getSeverityColor(error.code)} className="text-xs">
              {error.code}
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            {error.isRetryable && onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                disabled={isLoading}
                className="border-red-300 text-red-700 hover:bg-red-100"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                Retry
              </Button>
            )}
            {onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="text-red-500 hover:text-red-700 hover:bg-red-100"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-red-800 mb-3">{error.message}</p>
        
        {error.recoverySteps.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-red-700 mb-2">How to fix this:</h4>
            <ol className="text-sm text-red-700 space-y-1">
              {error.recoverySteps.map((step, index) => (
                <li key={index} className="flex items-start">
                  <span className="mr-2 text-red-500 font-medium">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {error.errorId && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-800 hover:bg-red-100 p-0 h-auto"
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 mr-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 mr-1" />
                )}
                Technical Details
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="bg-red-100 p-3 rounded-md">
                <p className="text-xs text-red-700 font-mono">
                  Error ID: {error.errorId}
                </p>
                <p className="text-xs text-red-700 mt-1">
                  If this problem persists, please contact support with this error ID.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );

  const renderToast = () => (
    <div className={`bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg ${className}`}>
      <div className="flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800">{error.message}</p>
          {error.recoverySteps.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-red-600 font-medium">Quick fix:</p>
              <p className="text-xs text-red-600 mt-1">
                {error.recoverySteps[0]}
              </p>
            </div>
          )}
          {error.isRetryable && onRetry && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              disabled={isLoading}
              className="mt-2 h-6 px-2 text-xs text-red-700 hover:text-red-800 hover:bg-red-100"
            >
              {isLoading ? (
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              Retry
            </Button>
          )}
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-100"
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );

  switch (variant) {
    case 'inline':
      return renderInline();
    case 'toast':
      return renderToast();
    case 'card':
    default:
      return renderCard();
  }
}

// Hook for managing error state
export function useErrorHandler() {
  const [error, setError] = React.useState<ErrorInfo | null>(null);
  const [isRetrying, setIsRetrying] = React.useState(false);

  const handleError = React.useCallback((errorResponse: any) => {
    if (errorResponse?.error) {
      setError(errorResponse.error);
    } else {
      setError({
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
        recoverySteps: ['Please try again', 'Contact support if problem persists'],
        isRetryable: true
      });
    }
  }, []);

  const retry = React.useCallback(async (retryFn: () => Promise<any>) => {
    if (!error?.isRetryable) return;
    
    setIsRetrying(true);
    setError(null);
    
    try {
      await retryFn();
    } catch (newError) {
      handleError(newError);
    } finally {
      setIsRetrying(false);
    }
  }, [error, handleError]);

  const dismiss = React.useCallback(() => {
    setError(null);
  }, []);

  return {
    error,
    isRetrying,
    handleError,
    retry,
    dismiss
  };
} 