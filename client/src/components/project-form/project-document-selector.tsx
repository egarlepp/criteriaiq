import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { File } from "lucide-react";

interface Document {
  id: number;
  givenName: string;
  fileName: string;
  fileSize: number;
  description: string;
  fileType: string;
  documentType: string;
  solutionIds: number[];
  owner: string;
  ownerId: string;
  projectId?: number;
  fileData: string;
  filePath?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProjectDocumentSelectorProps {
  selectedSolutions: string[];
  onDocumentSelect: (document: Document) => void;
  excludeDocumentIds?: number[];
  disableSolutionFilter?: boolean;
}

export function ProjectDocumentSelector({ selectedSolutions, onDocumentSelect, excludeDocumentIds = [], disableSolutionFilter = false }: ProjectDocumentSelectorProps) {
  const { t } = useTranslation();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    staleTime: 0,
  });

  const { data: products = [] } = useQuery<Array<{id: number, name: string, isActive: boolean, solutionIcon?: string; solutionIconName?: string | null}>>({
    queryKey: ["/api/products"],
    staleTime: 0,
  });

  const selectedSolutionIds = selectedSolutions.map(solutionName => {
    const product = products.find((p: any) => p.name === solutionName);
    return product?.id;
  }).filter(Boolean);

  const availableDocuments = disableSolutionFilter
    ? documents.filter(doc => !excludeDocumentIds.includes(doc.id))
    : documents.filter(doc =>
        doc.solutionIds &&
        doc.solutionIds.some(id => selectedSolutionIds.includes(id)) &&
        !excludeDocumentIds.includes(doc.id)
      );

  if (!disableSolutionFilter && selectedSolutions.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder={t('projects.form.selectSolutionsFirst')} />
        </SelectTrigger>
      </Select>
    );
  }

  if (availableDocuments.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder={t('projects.form.noMatchingDocuments')} />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={selectedDocumentId} onValueChange={(value) => {
      const document = availableDocuments.find(doc => doc.id.toString() === value);
      if (document) {
        onDocumentSelect(document);
        setSelectedDocumentId("");
      }
    }}>
      <SelectTrigger>
        <SelectValue placeholder={disableSolutionFilter ? t('projects.form.selectDocumentFromLibrary') : t('projects.form.selectDocumentFromArtifacts')} />
      </SelectTrigger>
      <SelectContent>
        {availableDocuments.map((document) => (
          <SelectItem key={document.id} value={document.id.toString()}>
            <div className="flex items-center gap-2">
              <File className="h-4 w-4" />
              <div className="flex flex-col">
                <span className="font-medium">{document.givenName}</span>
                <div className="flex gap-1 mt-1">
                  <Badge variant="secondary" className="text-xs">{document.documentType}</Badge>
                  {document.solutionIds?.map(solutionId => {
                    const solution = products.find((p) => p.id === solutionId);
                    return solution ? (
                      <SolutionBadge
                        key={solutionId}
                        solutionName={solution.name}
                        solutionIcon={solution.solutionIcon} solutionIconName={solution.solutionIconName}
                      />
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
