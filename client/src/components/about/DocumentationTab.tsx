import { useState, useEffect, useRef, Component } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, BookText, SquareTerminal, HelpCircle, Settings, Code, Workflow, Rocket, BarChart3, Edit, Sparkles, MessageSquarePlus, Globe, Mail, Bug, ShieldUser, HardDrive, FolderOpen, Activity, Wifi, TrendingUp, Building, ChevronDown, Calendar } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";

class MarkdownErrorBoundary extends Component<
  { content: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { content: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error("ReactMarkdown render error:", error.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800 dark:text-gray-200 leading-relaxed">
          {this.props.content}
        </pre>
      );
    }
    return this.props.children;
  }
}

interface DocumentationTabProps {
  documentationCategories: Array<{
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    items: Array<{
      id: string;
      name: string;
      icon: React.ComponentType<{ className?: string }>;
      description: string;
      endpoint: string;
      postedAt?: string;
      updatedAt?: string;
    }>;
  }>;
  /**
   * When set (from the `?doc=<id>` URL param — e.g. a global-search
   * result deep-link), auto-open the matching document on mount. The
   * id matches each item's `id` field. Without this, a search result
   * for a doc only landed the user on the Documentation tab's wall of
   * cards without opening the doc they searched for.
   */
  initialDocId?: string;
}

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * True when `dateStr` (YYYY-MM-DD) is within the last 2 days. Tolerates
 * up to a day of "future" skew so a doc dated today still counts as
 * recent regardless of the viewer's timezone (YYYY-MM-DD parses to
 * midnight UTC). Returns false for missing / unparseable dates.
 */
function isWithinTwoDays(dateStr?: string): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  const ageMs = Date.now() - t;
  return ageMs <= TWO_DAYS_MS && ageMs > -TWO_DAYS_MS;
}

/**
 * Decide which freshness badge (if any) a doc card should show.
 * "New" wins over "Updated" so a brand-new doc (whose posted and
 * updated dates are both recent) shows a single "New" pill rather than
 * both. Both badges auto-disappear once the relevant date is older
 * than 2 days.
 */
function freshnessBadge(
  postedAt?: string,
  updatedAt?: string,
): "new" | "updated" | null {
  if (isWithinTwoDays(postedAt)) return "new";
  if (isWithinTwoDays(updatedAt)) return "updated";
  return null;
}

export const DocumentationTab = ({ documentationCategories, initialDocId }: DocumentationTabProps) => {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string>("");
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const target = documentationCategories.find(c => c.name === "Project & Architecture");
    if (target) {
      initial.add(target.name);
    } else if (documentationCategories.length > 0) {
      initial.add(documentationCategories[0].name);
    }
    return initial;
  });

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const documentationItems = documentationCategories.flatMap(cat => cat.items);

  // Auto-open the doc named by `?doc=<id>` (e.g. a global-search
  // result deep-link). Guarded by a ref so it fires once per distinct
  // id — re-opening the same id (e.g. on an unrelated re-render)
  // doesn't re-fetch, but navigating to a different doc id does.
  const openedDocRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialDocId || openedDocRef.current === initialDocId) return;
    const match = documentationItems.find((d) => d.id === initialDocId);
    if (!match) return;
    openedDocRef.current = initialDocId;
    // Expand the matching category so the card is visible behind the
    // opened doc, then fetch + render the document content.
    const owningCategory = documentationCategories.find((c) =>
      c.items.some((d) => d.id === initialDocId),
    );
    if (owningCategory) {
      setExpandedCategories((prev) => new Set(prev).add(owningCategory.name));
    }
    fetchDocumentation(match.endpoint, match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocId, documentationItems]);

  const fetchDocumentation = async (endpoint: string, docId: string) => {
    setIsLoadingDoc(true);
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        const content = await response.text();
        setDocContent(content);
        setSelectedDoc(docId);
      } else {
        setDocContent("Failed to load documentation. Please try again or contact support.");
        setSelectedDoc(docId);
      }
    } catch (error) {
      setDocContent("Error loading documentation. Please check your connection and try again.");
      setSelectedDoc(docId);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const getCategoryColor = (color: string) => {
    const colors: Record<string, { bg: string, border: string, text: string, iconBg: string }> = {
      blue: { bg: 'bg-blue-50 dark:bg-blue-950', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-900 dark:text-blue-100', iconBg: 'bg-blue-100 dark:bg-blue-900' },
      green: { bg: 'bg-green-50 dark:bg-green-950', border: 'border-green-200 dark:border-green-800', text: 'text-green-900 dark:text-green-100', iconBg: 'bg-green-100 dark:bg-green-900' },
      cyan: { bg: 'bg-cyan-50 dark:bg-cyan-950', border: 'border-cyan-200 dark:border-cyan-800', text: 'text-cyan-900 dark:text-cyan-100', iconBg: 'bg-cyan-100 dark:bg-cyan-900' },
      purple: { bg: 'bg-purple-50 dark:bg-purple-950', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-900 dark:text-purple-100', iconBg: 'bg-purple-100 dark:bg-purple-900' },
      orange: { bg: 'bg-orange-50 dark:bg-orange-950', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-900 dark:text-orange-100', iconBg: 'bg-orange-100 dark:bg-orange-900' },
      red: { bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-200 dark:border-red-800', text: 'text-red-900 dark:text-red-100', iconBg: 'bg-red-100 dark:bg-red-900' },
      indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-900 dark:text-indigo-100', iconBg: 'bg-indigo-100 dark:bg-indigo-900' }
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="space-y-4">

      {/* Header - "Floating Rail" with Global Gradient */}
      <Card className="relative overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800 rounded-xl p-2 group">
        {/* 1. GLOBAL BACKGROUND GRADIENT */}
        <div
          className="dark:hidden absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(59,130,246,0.15) 60%, rgba(59,130,246,0.25) 100%)",
          }}
        />
        <div
          className="hidden dark:block absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, rgba(31,41,55,1) 0%, rgba(30,58,138,0.4) 70%, rgba(30,58,138,0.6) 100%)",
          }}
        />

        {/* 2. FLEX CONTAINER (Z-Index ensures it sits ON TOP of gradient) */}
        <div className="flex items-stretch h-24 relative z-10">
          {/* LEFT SIDE: Content */}
          <div className="flex-1 flex flex-col justify-center px-4">
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <BookText data-title-icon className="h-6 w-6" />
                Documentation Library
              </CardTitle>
              <CardDescription>
                Comprehensive documentation and guides for effective use of the CriteriaIQ platform. Documentation is organized into categories for easy navigation.
              </CardDescription>
            </CardHeader>

            {/* Decorative Background Icon */}
            <BookText
              className="absolute right-24 top-1/2 h-32 w-32 text-blue-500/5 dark:text-white/5 pointer-events-none"
              style={{ transform: "translateY(-50%) rotate(-12deg)" }}
            />
          </div>

          {/* RIGHT SIDE: The "Floating Rail" */}
          <div className="w-20 bg-[#1e3a8a] dark:bg-blue-900 rounded-lg flex items-center justify-center shadow-md text-white shrink-0 relative overflow-hidden ml-2 group-hover:shadow-lg transition-all duration-300">
            {/* Glass Gloss Effect */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
            <SquareTerminal className="h-8 w-8 text-blue-100" />
          </div>
        </div>
      </Card>
      {/* END Of Header */}

      {/* Documentation Categories */}
      {documentationCategories.map((category) => {
        const CategoryIcon = category.icon;
        const colors = getCategoryColor(category.color);

        const isExpanded = expandedCategories.has(category.name);

        return (
          <Card key={category.name} className={`${colors.bg} ${colors.border}`}>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => toggleCategory(category.name)}
            >
              <CardTitle className={`flex items-center gap-3 ${colors.text}`}>
                <CategoryIcon className={`h-5 w-5 ${colors.text}`} />
                {category.name}
                <ChevronDown
                  className={`h-4 w-4 ml-auto transition-transform duration-200 ${colors.text} ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </CardTitle>
            </CardHeader>
            {isExpanded && (
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {category.items.map((doc) => {
                    const DocIcon = doc.icon;
                    return (
                      <button
                        key={doc.id}
                        onClick={() => fetchDocumentation(doc.endpoint, doc.id)}
                        className={`block p-4 bg-white dark:bg-gray-900 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-sm transition-all text-left w-full ${
                          selectedDoc === doc.id
                            ? "border-primary ring-1 ring-primary"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <DocIcon className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{doc.name}</h3>
                              {(() => {
                                const badge = freshnessBadge(doc.postedAt, doc.updatedAt);
                                if (badge === "new") {
                                  return (
                                    <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                                      New
                                    </span>
                                  );
                                }
                                if (badge === "updated") {
                                  return (
                                    <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                                      Updated
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{doc.description}</p>
                            {(doc.postedAt || doc.updatedAt) && (
                              <div className="flex items-center gap-3 mt-2 flex-wrap">
                                {doc.postedAt && (
                                  <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                                    <Calendar className="h-3 w-3" />
                                    Posted {doc.postedAt}
                                  </span>
                                )}
                                {doc.updatedAt && doc.updatedAt !== doc.postedAt && (
                                  <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                                    <Calendar className="h-3 w-3" />
                                    Updated {doc.updatedAt}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Show selected document content below the menu */}
      {selectedDoc && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {documentationItems.find(item => item.id === selectedDoc)?.name || "Documentation"}
              </CardTitle>
              <Button
                variant="ghost"
                onClick={() => setSelectedDoc(null)}
                className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
              >
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingDoc ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600 dark:text-gray-400">Loading documentation...</span>
              </div>
            ) : (
              <div className="prose prose-lg max-w-none bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-300 dark:border-gray-700 shadow-sm markdown-content">
                <MarkdownErrorBoundary content={docContent}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight, rehypeRaw]}
                  components={{
                    code({node, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const language = match ? match[1] : '';
                      const isInline = !match;

                      // This respects your index.css rule to force light code blocks
                      if (language === 'mermaid') {
                        return (
                          <div className="bg-white p-4 rounded-lg border border-gray-200 my-4">
                            <div className="text-sm text-gray-600 mb-2 font-medium">Mermaid Diagram:</div>
                            <pre className="bg-gray-50 p-3 rounded text-sm font-mono text-gray-700 whitespace-pre-wrap" style={{ backgroundColor: '#f9fafb' }}>
                              {children}
                            </pre>
                          </div>
                        );
                      }

                      // This respects your index.css rule to force light code blocks
                      return !isInline ? (
                        <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto border border-gray-200 my-4" style={{ backgroundColor: '#f9fafb' }}>
                          <code className={`language-${language} text-gray-800`} {...props}>
                            {children}
                          </code>
                        </pre>
                      ) : (
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-gray-800" {...props}>
                          {children}
                        </code>
                      );
                    },
                    // Added dark-mode classes to all markdown elements
                    h1: ({children}: any) => <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100 border-b dark:border-gray-700 pb-2">{children}</h1>,
                    h2: ({children}: any) => <h2 className="text-2xl font-semibold mb-3 text-gray-800 dark:text-gray-200 mt-8">{children}</h2>,
                    h3: ({children}: any) => <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-6">{children}</h3>,
                    p: ({children}: any) => <p className="mb-4 leading-relaxed text-gray-700 dark:text-gray-300">{children}</p>,
                    ul: ({children}: any) => <ul className="mb-4 ml-6 list-disc space-y-1">{children}</ul>,
                    ol: ({children}: any) => <ol className="mb-4 ml-6 list-decimal space-y-1">{children}</ol>,
                    li: ({children}: any) => <li className="text-gray-700 dark:text-gray-300">{children}</li>,
                    blockquote: ({children}: any) => <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600 dark:text-gray-400 my-4">{children}</blockquote>,
                    table: ({children}: any) => <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 my-4">{children}</table>,
                    th: ({children}: any) => <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 bg-gray-50 dark:bg-gray-800 font-semibold text-left dark:text-gray-100">{children}</th>,
                    td: ({children}: any) => <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 dark:text-gray-300">{children}</td>,
                  }}
                >
                  {docContent}
                </ReactMarkdown>
                </MarkdownErrorBoundary>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};