import { useTranslation } from "react-i18next";
import { UseFormReturn } from "react-hook-form";
import { FormData } from "./types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProjectDocumentSelector } from "./project-document-selector";
import { ProjectLinkSelector } from "./project-link-selector";
import { X, Upload, File, Link, FileStack, FileText, BookMarked, Package, Video, Download, GraduationCap, Headphones, PlayCircle, Cloud, Globe, Building2 } from "lucide-react";

interface ArtifactsSectionProps {
  form: UseFormReturn<FormData>;
  products: any[];
  uploadedFiles: any[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<any[]>>;
  projectLinks: Array<{linkType: string, url: string, description: string, name?: string, linkId?: string}>;
  setProjectLinks: React.Dispatch<React.SetStateAction<Array<{linkType: string, url: string, description: string, name?: string, linkId?: string}>>>;
  isUploadDialogOpen: boolean;
  setIsUploadDialogOpen: (open: boolean) => void;
  uploadFormData: {
    givenName: string;
    description: string;
    documentType: string;
    solutionIds: number[];
    file: File | null;
  };
  setUploadFormData: React.Dispatch<React.SetStateAction<{
    givenName: string;
    description: string;
    documentType: string;
    solutionIds: number[];
    file: File | null;
  }>>;
  handleUploadSubmit: () => void;
}

export function ArtifactsSection({
  form,
  products,
  uploadedFiles,
  setUploadedFiles,
  projectLinks,
  setProjectLinks,
  isUploadDialogOpen,
  setIsUploadDialogOpen,
  uploadFormData,
  setUploadFormData,
  handleUploadSubmit,
}: ArtifactsSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2 dark:text-slate-200">
            <FileStack className="h-4 w-4" />
            {t('projects.projectDocuments')}
          </Label>
          <div className="min-w-48">
            <ProjectDocumentSelector
              selectedSolutions={form.watch("solutionName") || []}
              excludeDocumentIds={uploadedFiles
                .filter(file => file.isExistingDocument && file.documentId)
                .map(file => file.documentId)
              }
              onDocumentSelect={(document) => {
                console.log("Selected document:", document);
                const documentAsFile = {
                  name: document.givenName,
                  givenName: document.givenName,
                  originalName: document.fileName,
                  fileName: document.fileName,
                  fileType: document.fileType,
                  fileSize: document.fileSize,
                  description: document.description,
                  documentType: document.documentType,
                  filePath: document.filePath,
                  documentId: document.id,
                  isExistingDocument: true,
                  documentData: document,
                };

                const newFiles = [...uploadedFiles, documentAsFile];
                console.log("Adding document to uploadedFiles. Current:", uploadedFiles, "New:", newFiles);
                setUploadedFiles(newFiles);
                form.setValue("uploadedFiles", newFiles, { shouldDirty: true });

                setTimeout(() => {
                  console.log("After adding document - uploadedFiles state:", uploadedFiles);
                  console.log("After adding document - form value:", form.getValues("uploadedFiles"));
                }, 100);
              }}
            />
          </div>
        </div>

        {uploadedFiles.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">
            {t('projects.form.artifacts.noDocumentsYet')}
          </div>
        )}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium dark:text-slate-200">{t('projects.form.artifacts.uploadedFiles')}</Label>
            {uploadedFiles.map((file, index) => {
              const fileName = file.name || file.givenName || file.originalName || t('projects.form.artifacts.documentFallback', { number: index + 1 });
              const fileSize = file.size ? (file.size / 1024 / 1024).toFixed(2) : (file.fileSize ? (file.fileSize / 1024 / 1024).toFixed(2) : t('projects.form.artifacts.unknownSize'));

              return (
                <div key={`file-upload-${fileName}-${index}`} className="flex items-center justify-between p-2 border rounded dark:border-slate-700">
                  <div className="flex items-center space-x-2">
                    <File className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                    <span className="text-sm dark:text-slate-200">{fileName}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      {file.size || file.fileSize ? `(${fileSize} MB)` : ''}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newFiles = uploadedFiles.filter((_, i) => i !== index);
                      setUploadedFiles(newFiles);
                      form.setValue("uploadedFiles", newFiles);
                    }}
                    className="dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('projects.form.artifacts.uploadDocument')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="docName">{t('projects.form.artifacts.documentName')}</Label>
                <Input
                  id="docName"
                  value={uploadFormData.givenName}
                  onChange={(e) => setUploadFormData(prev => ({ ...prev, givenName: e.target.value }))}
                  placeholder={t('projects.form.artifacts.documentNamePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="docType">{t('projects.form.artifacts.documentType')}</Label>
                <Select value={uploadFormData.documentType} onValueChange={(value) => setUploadFormData(prev => ({ ...prev, documentType: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('projects.form.artifacts.selectType')} />
                  </SelectTrigger>
                  <SelectContent>
                    {["Architecture", "Product Info", "Visio", "Reference", "Documentation", "Other"].map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="docDescription">{t('common.description')}</Label>
              <Textarea
                id="docDescription"
                value={uploadFormData.description}
                onChange={(e) => setUploadFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('projects.form.artifacts.descriptionPlaceholder')}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('projects.form.artifacts.solutions')}</Label>
              <div className="border rounded-lg p-3 max-h-32 overflow-y-auto">
                {products.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('projects.form.artifacts.loadingSolutions')}</p>
                ) : (
                  <div className="space-y-2">
                    {products.map((solution: any) => (
                      <label key={solution.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={uploadFormData.solutionIds.includes(solution.id)}
                          onChange={() => {
                            setUploadFormData(prev => ({
                              ...prev,
                              solutionIds: prev.solutionIds.includes(solution.id)
                                ? prev.solutionIds.filter(id => id !== solution.id)
                                : [...prev.solutionIds, solution.id]
                            }));
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{solution.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="docFile">{t('projects.form.artifacts.file')}</Label>
              <Input
                id="docFile"
                type="file"
                accept="*/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setUploadFormData(prev => ({ ...prev, file }));
                  }
                }}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('projects.form.artifacts.maxFileSize')}</p>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => {
                setIsUploadDialogOpen(false);
                setUploadFormData({
                  givenName: "",
                  description: "",
                  documentType: "",
                  solutionIds: [],
                  file: null
                });
              }}>
                <X className="h-4 w-4 mr-2" />
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleUploadSubmit}
                disabled={!uploadFormData.givenName || !uploadFormData.documentType || !uploadFormData.file}
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('projects.form.artifacts.upload')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4 border-t pt-6 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2 dark:text-slate-200">
            <Link className="h-4 w-4" />
            {t('projects.projectLinks')}
          </Label>
          <div className="flex items-center gap-3">
            <div className="min-w-48">
              <ProjectLinkSelector
                selectedSolutions={form.watch("solutionName") || []}
                excludeLinkIds={projectLinks
                  .map(link => (link.linkId != null ? Number(link.linkId) : NaN))
                  .filter((id): id is number => Number.isFinite(id))}
                onLinkSelect={(link) => {
                  setProjectLinks([...projectLinks, {
                    linkType: link.linkType,
                    url: link.url,
                    description: link.description,
                    name: link.name,
                    linkId: link.linkId != null ? String(link.linkId) : undefined,
                  }]);
                }}
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="pl-[16px] pr-[16px]"
              onClick={() => {
                setProjectLinks([...projectLinks, { linkType: "Documentation", url: "", description: "", name: "" }]);
              }}
            >
              <Link className="h-4 w-4 mr-2" />
              {t('projects.form.artifacts.addLink')}
            </Button>
          </div>
        </div>

        {projectLinks.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-slate-400">
            {t('projects.form.artifacts.noLinksYet')}
          </div>
        ) : (
          <div className="space-y-4">
            {projectLinks.map((link, index) => (
              <div key={`link-${index}`} className="border rounded-lg p-4 space-y-4 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium dark:text-slate-200">{link.name || link.description || t('projects.form.artifacts.linkFallback', { number: index + 1 })}</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newLinks = projectLinks.filter((_, i) => i !== index);
                      setProjectLinks(newLinks);
                    }}
                    className="dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="dark:text-slate-200">{t('projects.form.artifacts.linkType')}</Label>
                    <Select
                      value={link.linkType}
                      onValueChange={(value) => {
                        const newLinks = [...projectLinks];
                        newLinks[index].linkType = value;
                        setProjectLinks(newLinks);
                      }}
                    >
                      <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Documentation"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-cyan-500" />{t('projects.form.artifacts.linkTypeDocumentation')}</div></SelectItem>
                        <SelectItem value="Tutorial"><div className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-indigo-500" />{t('projects.form.artifacts.linkTypeTutorial')}</div></SelectItem>
                        <SelectItem value="Reference"><div className="flex items-center gap-2"><BookMarked className="h-4 w-4 text-green-500" />{t('projects.form.artifacts.linkTypeReference')}</div></SelectItem>
                        <SelectItem value="Product Info"><div className="flex items-center gap-2"><Package className="h-4 w-4 text-purple-500" />{t('projects.form.artifacts.linkTypeProductInfo')}</div></SelectItem>
                        <SelectItem value="Support"><div className="flex items-center gap-2"><Headphones className="h-4 w-4 text-pink-500" />{t('projects.form.artifacts.linkTypeSupport')}</div></SelectItem>
                        <SelectItem value="Demo"><div className="flex items-center gap-2"><PlayCircle className="h-4 w-4 text-amber-500" />{t('projects.form.artifacts.linkTypeDemo')}</div></SelectItem>
                        <SelectItem value="Video"><div className="flex items-center gap-2"><Video className="h-4 w-4 text-red-500" />{t('projects.form.artifacts.linkTypeVideo')}</div></SelectItem>
                        <SelectItem value="Download"><div className="flex items-center gap-2"><Download className="h-4 w-4 text-teal-500" />{t('projects.form.artifacts.linkTypeDownload')}</div></SelectItem>
                        <SelectItem value="Architecture"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-500" />{t('projects.form.artifacts.linkTypeArchitecture')}</div></SelectItem>
                        <SelectItem value="CloudLAB"><div className="flex items-center gap-2"><Cloud className="h-4 w-4 text-sky-500" />{t('projects.form.artifacts.linkTypeCloudLAB')}</div></SelectItem>
                        <SelectItem value="Portal"><div className="flex items-center gap-2"><Globe className="h-4 w-4 text-emerald-500" />{t('projects.form.artifacts.linkTypePortal')}</div></SelectItem>
                        <SelectItem value="Other"><div className="flex items-center gap-2"><File className="h-4 w-4 text-slate-500" />{t('projects.form.artifacts.linkTypeOther')}</div></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="dark:text-slate-200">{t('projects.form.artifacts.url')}</Label>
                    <Input
                      type="url"
                      placeholder="https://example.com"
                      value={link.url}
                      onChange={(e) => {
                        const newLinks = [...projectLinks];
                        newLinks[index].url = e.target.value;
                        setProjectLinks(newLinks);
                      }}
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <Label className="dark:text-slate-200">{t('common.description')}</Label>
                    <Input
                      placeholder={t('projects.form.artifacts.linkDescriptionPlaceholder')}
                      value={link.description}
                      onChange={(e) => {
                        const newLinks = [...projectLinks];
                        newLinks[index].description = e.target.value;
                        setProjectLinks(newLinks);
                      }}
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
