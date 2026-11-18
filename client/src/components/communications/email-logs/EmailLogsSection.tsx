import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeEmailHtml } from "@/lib/safeHtml";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Eye, ExternalLink, Calendar, CalendarDays, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { format, startOfWeek, startOfMonth, isAfter } from 'date-fns';
import { SortableTable, SortableTableHead, SortableTableHeader, SortableTableBody, SortableTableRow, SortableTableCell } from '@/components/ui/sortable-table';
import { useUrlSortState, makeComparator, stableSort } from '@/lib/sorting';
import { EmailLog } from "../types";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";

interface EmailLogsSectionProps {
  activeTab: string;
}

const EmailLogDetails = ({ email }: { email: EmailLog }) => {
  return (
    <div className="space-y-4">     
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <strong>From:</strong> {email.fromEmail}
        </div>
        <div>
          <strong>To:</strong> {email.toEmail}
        </div>
        <div>
          <strong>Subject:</strong> {email.subject}
        </div>
        <div>
          <strong>Status:</strong>
          <Badge
            variant={email.success ? "default" : "destructive"}
            className={email.success ? "ml-2 bg-green-500 hover:bg-green-600" : "ml-2"}
          >
            {email.success ? "Sent" : "Failed"}
          </Badge>
        </div>
        <div>
          <strong>Sent:</strong> {email.sentAt ? new Date(email.sentAt).toLocaleString() : 'N/A'}
        </div>
        {email.emailType && (
          <div>
            <strong>Type:</strong> {email.emailType}
          </div>
        )}
        {email.error && (
          <div className="col-span-2">
            <strong>Error:</strong>
            <div className="text-red-600 mt-1">{email.error}</div>
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h4 className="font-medium mb-2">Email Content:</h4>
        {email.htmlContent ? (
          <div className="border rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.htmlContent) }} />
          </div>
        ) : (
          <div className="border rounded-lg p-4 bg-gray-50 whitespace-pre-wrap">
            {email.textContent || "No content available"}
          </div>
        )}
      </div>
    </div>
  );
};

export default function EmailLogsSection({ activeTab }: EmailLogsSectionProps) {
  const { toast } = useToast();

  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [isEmailLoading, setIsEmailLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [emailStartDate, setEmailStartDate] = useState<string>("");
  const [emailEndDate, setEmailEndDate] = useState<string>("");

  const [emailSortConfig, handleEmailSort] = useUrlSortState('emailLogs');
  const [sortAnnouncement, setSortAnnouncement] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    if (activeTab === "email-logs") {
      const fetchEmailLogs = async () => {
        try {
          setIsEmailLoading(true);
          const response = await fetch('/api/email-logs');
          const data = await response.json();
          setEmailLogs(data.emails || []);
        } catch (error) {
          console.error('Failed to fetch email logs:', error);
        } finally {
          setIsEmailLoading(false);
        }
      };

      fetchEmailLogs();
    }
  }, [activeTab]);

  const filteredEmailLogs = useMemo(() => {
    return emailLogs.filter(email => {
      const matchesSearch = !searchTerm ||
        email.toEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.fromEmail?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "success" && email.success) ||
        (statusFilter === "failed" && !email.success);

      const matchesType = typeFilter === "all" || email.emailType === typeFilter;

      const matchesDateRange = (!emailStartDate || !email.sentAt || new Date(email.sentAt) >= new Date(emailStartDate)) &&
                              (!emailEndDate || !email.sentAt || new Date(email.sentAt) <= new Date(emailEndDate));

      return matchesSearch && matchesStatus && matchesType && matchesDateRange;
    });
  }, [emailLogs, searchTerm, statusFilter, typeFilter, emailStartDate, emailEndDate]);

  const sortedEmailLogs = useMemo(() => {
    if (!emailSortConfig) {
      return filteredEmailLogs;
    }
    const comparator = makeComparator(emailSortConfig);
    return stableSort(filteredEmailLogs, comparator);
  }, [filteredEmailLogs, emailSortConfig]);

  const paginatedEmailLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedEmailLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedEmailLogs, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter, emailStartDate, emailEndDate]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (statusFilter !== "all") count++;
    if (typeFilter !== "all") count++;
    if (emailStartDate) count++;
    if (emailEndDate) count++;
    return count;
  }, [searchTerm, statusFilter, typeFilter, emailStartDate, emailEndDate]);

  const emailStats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const totalEmails = filteredEmailLogs.length;
    const emailsThisWeek = filteredEmailLogs.filter(email => 
      email.sentAt && isAfter(new Date(email.sentAt), weekStart)
    ).length;
    const emailsThisMonth = filteredEmailLogs.filter(email => 
      email.sentAt && isAfter(new Date(email.sentAt), monthStart)
    ).length;
    const successfulEmails = filteredEmailLogs.filter(email => email.success).length;
    const successRate = totalEmails > 0 ? Math.round((successfulEmails / totalEmails) * 100) : 0;

    return {
      totalEmails,
      emailsThisWeek,
      emailsThisMonth,
      successRate,
    };
  }, [filteredEmailLogs]);

  const clearAllFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setTypeFilter("all");
    setEmailStartDate("");
    setEmailEndDate("");
  };

  const handleSortWithAnnouncement = (key: string) => {
    handleEmailSort(key);
    const direction = emailSortConfig?.key === key && emailSortConfig?.direction === 'asc' ? 'descending' : 'ascending';
    setSortAnnouncement(`Table sorted by ${key} in ${direction} order`);
    setTimeout(() => setSortAnnouncement(''), 1000);
  };

  const urlParams = new URLSearchParams(window.location.search);
  const executionId = urlParams.get('executionId');
  const filterParam = urlParams.get('filter');

  return (
    <div className="space-y-4">
      {(executionId || filterParam) && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-blue-700 dark:text-blue-300" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Deep-linked from Diagnostics
            </span>
          </div>
          {executionId && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Viewing execution ID: {executionId}
            </p>
          )}
          {filterParam && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Filter: {filterParam}
            </p>
          )}
        </div>
      )}
          <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <FilterLabel>Search Emails</FilterLabel>
                <Input
                  id="email-search"
                  placeholder="Search by recipient, sender, or subject..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <FilterLabel>Start Date</FilterLabel>
                <Input
                  type="date"
                  value={emailStartDate}
                  onChange={(e) => setEmailStartDate(e.target.value)}
                />
              </div>
              <div>
                <FilterLabel>End Date</FilterLabel>
                <Input
                  type="date"
                  value={emailEndDate}
                  onChange={(e) => setEmailEndDate(e.target.value)}
                />
              </div>
              <div>
                <FilterLabel>Status</FilterLabel>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SearchFiltersSection>
          
      <Card className="relative overflow-hidden pt-4">
        <DecorativeCardIcon icon={Mail} />
        
        {/* Email Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 px-6 pb-4 relative z-10">
          <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-950/30">
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Mail className="h-24 w-24 opacity-10 text-blue-600" />
            </div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="tracking-tight text-[19px] font-bold">Emails Sent</CardTitle>
              <Mail className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent className="relative">
              {isEmailLoading ? (
                <div className="text-2xl font-bold text-muted-foreground">...</div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{emailStats.totalEmails}</div>
                  <p className="text-xs text-muted-foreground">Total emails</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-950/30">
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Calendar className="h-24 w-24 opacity-10 text-purple-600" />
            </div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="tracking-tight text-[19px] font-bold">Emails Sent this Week</CardTitle>
              <Calendar className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent className="relative">
              {isEmailLoading ? (
                <div className="text-2xl font-bold text-muted-foreground">...</div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{emailStats.emailsThisWeek}</div>
                  <p className="text-xs text-muted-foreground">This week</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-amber-50/80 dark:bg-amber-950/30">
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <CalendarDays className="h-24 w-24 opacity-10 text-amber-600" />
            </div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="tracking-tight text-[19px] font-bold">Emails Sent this Month</CardTitle>
              <CalendarDays className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent className="relative">
              {isEmailLoading ? (
                <div className="text-2xl font-bold text-muted-foreground">...</div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{emailStats.emailsThisMonth}</div>
                  <p className="text-xs text-muted-foreground">This month</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-950/30">
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <CheckCircle className="h-24 w-24 opacity-10 text-green-600" />
            </div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="tracking-tight text-[19px] font-bold">Email Success rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent className="relative">
              {isEmailLoading ? (
                <div className="text-2xl font-bold text-muted-foreground">...</div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{emailStats.successRate}%</div>
                  <p className="text-xs text-muted-foreground">Delivery success</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <CardContent className="relative z-10">
          {isEmailLoading ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading email logs...</p>
            </div>
          ) : filteredEmailLogs.length > 0 ? (
            <div>
              <SortableTable>
                <SortableTableHeader>
                  <SortableTableRow>
                  <SortableTableHead
                    sortKey="id"
                    sortConfig={emailSortConfig}
                    onSort={(key) => handleSortWithAnnouncement(key)}
                    tooltipText="Click to sort by ID"
                  >
                    ID
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="toEmail"
                    sortConfig={emailSortConfig}
                    onSort={(key) => handleSortWithAnnouncement(key)}
                    tooltipText="Click to sort by recipient email"
                  >
                    To Email
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="subject"
                    sortConfig={emailSortConfig}
                    onSort={(key) => handleSortWithAnnouncement(key)}
                    tooltipText="Click to sort by subject"
                  >
                    Subject
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="success"
                    sortConfig={emailSortConfig}
                    onSort={(key) => handleSortWithAnnouncement(key)}
                    tooltipText="Click to sort by status"
                  >
                    Status
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="sentAt"
                    sortConfig={emailSortConfig}
                    onSort={(key) => handleSortWithAnnouncement(key)}
                    tooltipText="Click to sort by sent date"
                  >
                    Sent At
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="actions"
                    sortConfig={emailSortConfig}
                    onSort={(key) => handleSortWithAnnouncement(key)}
                  >
                    Actions
                  </SortableTableHead>
                  </SortableTableRow>
                </SortableTableHeader>
                <SortableTableBody>
                  {paginatedEmailLogs.map((email: EmailLog) => (
                    <SortableTableRow key={email.id}>
                      <SortableTableCell>{email.id}</SortableTableCell>
                      <SortableTableCell>{email.toEmail}</SortableTableCell>
                      <SortableTableCell>{email.subject}</SortableTableCell>
                      <SortableTableCell>
                        <Badge
                          variant={email.success ? "default" : "destructive"}
                          className={email.success ? "bg-green-500 hover:bg-green-600" : ""}
                        >
                          {email.success ? "Sent" : "Failed"}
                        </Badge>
                        {email.emailType && (
                          <Badge variant="outline" className="ml-2">
                            {email.emailType.split('_').map((word: string) =>
                              word.charAt(0).toUpperCase() + word.slice(1)
                            ).join(' ')}
                          </Badge>
                        )}
                      </SortableTableCell>
                      <SortableTableCell>
                        {email.sentAt ? format(new Date(email.sentAt), 'MMM dd, yyyy HH:mm') : 'N/A'}
                      </SortableTableCell>
                      <SortableTableCell>
                        <div className="flex space-x-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setSelectedEmail(email)}>
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                              <DialogHeader>
                                <DialogTitle>Email Details</DialogTitle>
                                <DialogDescription>
                                  Sent on {email.sentAt ? format(new Date(email.sentAt), 'MMM dd, yyyy HH:mm') : 'N/A'}
                                </DialogDescription>
                              </DialogHeader>
                              <EmailLogDetails email={email} />
                            </DialogContent>
                          </Dialog>
                        </div>
                      </SortableTableCell>
                    </SortableTableRow>
                  ))}
                </SortableTableBody>
              </SortableTable>

              <TablePaginationFooter
                totalItems={sortedEmailLogs.length}
                pageSize={itemsPerPage}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                entityLabel="email logs"
              />
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Mail className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No email logs found</p>
              <p className="text-sm">Email logs will appear here when emails are sent</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Detailed view of the email content and metadata
            </DialogDescription>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>From:</strong> {selectedEmail.fromEmail}
                </div>
                <div>
                  <strong>To:</strong> {selectedEmail.toEmail}
                </div>
                <div>
                  <strong>Subject:</strong> {selectedEmail.subject}
                </div>
                <div>
                  <strong>Status:</strong>
                  <Badge
                    variant={selectedEmail.success ? "default" : "destructive"}
                    className={selectedEmail.success ? "ml-2 bg-green-500 hover:bg-green-600" : "ml-2"}
                  >
                    {selectedEmail.success ? "Sent" : "Failed"}
                  </Badge>
                </div>
                <div>
                  <strong>Sent:</strong> {new Date(selectedEmail.sentAt).toLocaleString()}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Email Content:</h4>
                {selectedEmail.htmlContent ? (
                  <div className="border rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
                    <div dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(selectedEmail.htmlContent) }} />
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 bg-gray-50 whitespace-pre-wrap">
                    {selectedEmail.textContent || "No content available"}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
