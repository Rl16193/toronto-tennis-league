import React from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { Button } from '../../components/Button';

type Props = { children: React.ReactNode; onDownload: () => void };
type State = { hasError: boolean };

export class BracketErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[2rem] bg-red-500/10 border border-red-500/20 p-10 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-white font-bold text-lg">Failed to load the bracket.</p>
          <p className="text-gray-400 text-sm">Download the draw to view it offline.</p>
          <Button variant="outline" onClick={this.props.onDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download Draw
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
