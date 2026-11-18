import React, { Suspense } from 'react';

// TinyMCE is a ~1.4 MB editor. Wrapping its consumer in `React.lazy` keeps the
// heavy bundle (TinyMCE core + skin + every plugin) out of the initial page
// load — it's only fetched the first time an admin opens the email design
// drawer.
const LazyEmailDesignEditor = React.lazy(async () => {
  const mod = await import('./EmailDesignEditorImpl');
  return { default: mod.EmailDesignEditor };
});

type EmailDesignEditorProps = React.ComponentProps<typeof LazyEmailDesignEditor>;

const EditorFallback: React.FC<{ height?: number }> = ({ height = 400 }) => (
  <div
    className="flex items-center justify-center border border-input rounded-md bg-muted/30"
    style={{ height: `${height}px` }}
  >
    <div className="text-sm text-muted-foreground">Loading editor…</div>
  </div>
);

export const EmailDesignEditor: React.FC<EmailDesignEditorProps> = (props) => (
  <Suspense fallback={<EditorFallback height={props.height} />}>
    <LazyEmailDesignEditor {...props} />
  </Suspense>
);
