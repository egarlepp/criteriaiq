import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { Link as LinkIcon } from "lucide-react";

interface Link {
  id: number;
  name: string;
  description: string;
  linkType: string;
  url: string;
  solutionIds: number[];
  owner: string;
  ownerId: string;
  projectId?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProjectLinkSelectorProps {
  selectedSolutions: string[];
  onLinkSelect: (link: { linkType: string; url: string; description: string; name: string; linkId?: number }) => void;
  excludeLinkIds?: number[];
  disableSolutionFilter?: boolean;
}

export function ProjectLinkSelector({ selectedSolutions, onLinkSelect, excludeLinkIds = [], disableSolutionFilter = false }: ProjectLinkSelectorProps) {
  const { t } = useTranslation();
  const [selectedLinkId, setSelectedLinkId] = useState<string>("");

  const { data: links = [] } = useQuery<Link[]>({
    queryKey: ["/api/links"],
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

  const availableLinks = disableSolutionFilter
    ? links.filter(link => !excludeLinkIds.includes(link.id))
    : links.filter(link =>
        link.solutionIds &&
        link.solutionIds.some(id => selectedSolutionIds.includes(id)) &&
        !excludeLinkIds.includes(link.id)
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

  if (availableLinks.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder={t('projects.form.noMatchingLinks')} />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={selectedLinkId} onValueChange={(value) => {
      const link = availableLinks.find(l => l.id.toString() === value);
      if (link) {
        onLinkSelect({
          linkType: link.linkType,
          url: link.url,
          description: link.description,
          name: link.name,
          linkId: link.id
        });
        setSelectedLinkId("");
      }
    }}>
      <SelectTrigger>
        <SelectValue placeholder={disableSolutionFilter ? t('projects.form.selectLinkFromLibrary') : t('projects.form.selectLinkFromArtifacts')} />
      </SelectTrigger>
      <SelectContent>
        {availableLinks.map((link) => (
          <SelectItem key={link.id} value={link.id.toString()}>
            <div className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              <div className="flex flex-col">
                <span className="font-medium">{link.name}</span>
                <div className="flex gap-1 mt-1">
                  <Badge variant="secondary" className="text-xs">{link.linkType}</Badge>
                  {link.solutionIds?.map(solutionId => {
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
