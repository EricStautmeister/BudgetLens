// frontend/src/pages/TransferReview.tsx - Revamped for manual classification and pattern learning

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box,
    Paper,
    Typography,
    Button,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    Grid,
    Card,
    CardContent,
    Alert,
    LinearProgress,
    Tooltip,
    Divider,
    Stack,
    Switch,
    FormControlLabel,
    Tabs,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Badge,
    Slider,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    Collapse,
} from '@mui/material';
import {
    SwapHoriz,
    AccountBalance,
    Edit,
    Check,
    Add,
    Delete,
    Savings,
    Category as CategoryIcon,
    Psychology,
    Settings,
    AutoFixHigh,
    TrendingUp,
    History,
    School,
    ExpandMore,
    Visibility,
    VisibilityOff,
    CheckCircle,
    Warning,
    Error,
    Info,
    Close,
    KeyboardArrowDown,
    KeyboardArrowUp,
    Refresh,
    FilterList,
    SmartToy,
    Timeline,
    ThumbUp,
    ThumbDown,
    CompareArrows,
    Assessment,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { apiClient } from '../services/api';

interface TransferSuggestion {
    from_transaction: {
        id: string;
        date: string;
        amount: number;
        description: string;
        account_id: string;
    };
    to_transaction: {
        id: string;
        date: string;
        amount: number;
        description: string;
        account_id: string;
    };
    confidence: number;
    amount: number;
    date_difference: number;
    matched_pattern?: string;
    pattern_id?: string;
    auto_confirm?: boolean;
    suggested_reason?: string;
}

interface TransferPattern {
    id: string;
    pattern_name: string;
    from_account_pattern: string;
    to_account_pattern: string;
    description_pattern: string;
    typical_amount: number | null;
    amount_tolerance: number;
    max_days_between: number;
    confidence_threshold: number;
    auto_confirm: boolean;
    times_matched: number;
    last_matched: string | null;
    is_active: boolean;
    created_at: string;
}

interface Account {
    id: string;
    name: string;
    account_type: string;
    is_active: boolean;
    is_main_account: boolean;
    account_classification: string;
}

export const TransferReview: React.FC = () => {
    const { enqueueSnackbar } = useSnackbar();
    const queryClient = useQueryClient();

    const [currentTab, setCurrentTab] = useState(0);
    const [selectedSuggestion, setSelectedSuggestion] = useState<TransferSuggestion | null>(null);
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [patternSettingsOpen, setPatternSettingsOpen] = useState(false);
    const [selectedPattern, setSelectedPattern] = useState<TransferPattern | null>(null);
    const [patternSettings, setPatternSettings] = useState({
        auto_confirm: false,
        confidence_threshold: 0.8,
        amount_tolerance: 0.05,
        max_days_between: 3,
        is_active: true
    });

    // Get transfer suggestions
    const { data: suggestionsResponse, isLoading: suggestionsLoading, refetch: refetchSuggestions } = useQuery({
        queryKey: ['transfer-suggestions'],
        queryFn: () => apiClient.getTransferSuggestions(50),
    });
    const suggestions = suggestionsResponse?.data?.suggestions || [];

    // Get learned transfer patterns
    const { data: patternsResponse, isLoading: patternsLoading, refetch: refetchPatterns } = useQuery({
        queryKey: ['transfer-patterns'],
        queryFn: () => apiClient.getTransferPatterns(),
    });
    const patterns = patternsResponse?.data?.patterns || [];

    // Get accounts
    const { data: accountsResponse } = useQuery({
        queryKey: ['accounts'],
        queryFn: () => apiClient.getAccounts(),
    });
    const accounts = accountsResponse?.data || [];

    // Create manual transfer mutation
    const createTransferMutation = useMutation({
        mutationFn: ({ suggestion, learnPattern }: { suggestion: TransferSuggestion; learnPattern: boolean }) =>
            apiClient.createManualTransfer({
                from_transaction_id: suggestion.from_transaction.id,
                to_transaction_id: suggestion.to_transaction.id,
                amount: suggestion.amount
            }, learnPattern),
        onSuccess: (data, variables) => {
            enqueueSnackbar(
                variables.learnPattern
                    ? 'Transfer created and pattern learned successfully'
                    : 'Transfer created successfully',
                { variant: 'success' }
            );
            queryClient.invalidateQueries({ queryKey: ['transfer-suggestions'] });
            queryClient.invalidateQueries({ queryKey: ['transfer-patterns'] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            setConfirmDialogOpen(false);
            setSelectedSuggestion(null);
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to create transfer',
                { variant: 'error' }
            );
        },
    });

    // Update pattern mutation
    const updatePatternMutation = useMutation({
        mutationFn: ({ patternId, settings }: { patternId: string; settings: any }) =>
            apiClient.updateTransferPattern(patternId, settings),
        onSuccess: () => {
            enqueueSnackbar('Pattern updated successfully', { variant: 'success' });
            queryClient.invalidateQueries({ queryKey: ['transfer-patterns'] });
            setPatternSettingsOpen(false);
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to update pattern',
                { variant: 'error' }
            );
        },
    });

    // Delete pattern mutation
    const deletePatternMutation = useMutation({
        mutationFn: (patternId: string) => apiClient.deleteTransferPattern(patternId),
        onSuccess: () => {
            enqueueSnackbar('Pattern deleted successfully', { variant: 'success' });
            queryClient.invalidateQueries({ queryKey: ['transfer-patterns'] });
        },
        onError: (error: any) => {
            enqueueSnackbar(
                error.response?.data?.detail || 'Failed to delete pattern',
                { variant: 'error' }
            );
        },
    });

    const handleConfirmTransfer = (suggestion: TransferSuggestion) => {
        setSelectedSuggestion(suggestion);
        setConfirmDialogOpen(true);
    };

    const handleCreateTransfer = (learnPattern: boolean) => {
        if (!selectedSuggestion) return;

        createTransferMutation.mutate({
            suggestion: selectedSuggestion,
            learnPattern
        });
    };

    const handleOpenPatternSettings = (pattern: TransferPattern) => {
        setSelectedPattern(pattern);
        setPatternSettings({
            auto_confirm: pattern.auto_confirm,
            confidence_threshold: pattern.confidence_threshold,
            amount_tolerance: pattern.amount_tolerance,
            max_days_between: pattern.max_days_between,
            is_active: pattern.is_active
        });
        setPatternSettingsOpen(true);
    };

    const handleUpdatePattern = () => {
        if (!selectedPattern) return;

        updatePatternMutation.mutate({
            patternId: selectedPattern.id,
            settings: patternSettings
        });
    };

    const handleDeletePattern = (patternId: string) => {
        if (confirm('Are you sure you want to delete this pattern? This action cannot be undone.')) {
            deletePatternMutation.mutate(patternId);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF',
        }).format(amount);
    };

    const getAccountName = (accountId: string) => {
        const account = accounts.find((a: Account) => a.id === accountId);
        return account ? account.name : 'Unknown Account';
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.9) return 'success';
        if (confidence >= 0.7) return 'warning';
        return 'error';
    };

    const getPatternStatusIcon = (pattern: TransferPattern) => {
        if (!pattern.is_active) return <VisibilityOff color="disabled" />;
        if (pattern.auto_confirm) return <CheckCircle color="success" />;
        return <Visibility color="primary" />;
    };

    // Group suggestions by confidence and pattern
    const highConfidenceSuggestions = suggestions.filter((s: TransferSuggestion) => s.confidence >= 0.8);
    const mediumConfidenceSuggestions = suggestions.filter((s: TransferSuggestion) => s.confidence >= 0.5 && s.confidence < 0.8);
    const lowConfidenceSuggestions = suggestions.filter((s: TransferSuggestion) => s.confidence < 0.5);

    if (suggestionsLoading || patternsLoading) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography variant="h4" gutterBottom>
                    Transfer Detection & Learning
                </Typography>
                <LinearProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" gutterBottom>
                    Transfer Detection & Learning
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<Refresh />}
                    onClick={() => {
                        refetchSuggestions();
                        refetchPatterns();
                    }}
                >
                    Refresh
                </Button>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                    <strong>Transfer Review for Account Transfer Transactions:</strong> This page shows suggestions for
                    transactions that have been categorized as "Account Transfers" and may be paired as transfers between
                    your accounts. Only transactions with the "Account Transfers" category will appear here for review.
                </Typography>
            </Alert>

            {/* Help Section */}
            <Paper sx={{ mb: 3, p: 3, backgroundColor: 'primary.light', color: 'primary.contrastText' }}>
                <Typography variant="h6" gutterBottom color="inherit">
                    <Info sx={{ mr: 1 }} />
                    How Transfer Detection Works
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <Typography variant="body2" paragraph color="inherit">
                            <strong>1. Categorize as Transfers:</strong> First, categorize relevant transactions as
                            "Account Transfers" in the Review page. Only these transactions will appear here.
                        </Typography>
                        <Typography variant="body2" paragraph color="inherit">
                            <strong>2. Review Suggestions:</strong> The system analyzes transactions categorized as
                            "Account Transfers" and suggests potential pairs based on matching amounts, dates, and patterns.
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Typography variant="body2" paragraph color="inherit">
                            <strong>3. Confirm Transfers:</strong> Review each suggestion and confirm those that are
                            actual transfers between your accounts.
                        </Typography>
                        <Typography variant="body2" paragraph color="inherit">
                            <strong>4. Learn Patterns:</strong> When you confirm a transfer with "Learn Pattern",
                            the system creates or updates patterns for similar future transfers.
                        </Typography>
                        <Typography variant="body2" paragraph color="inherit">
                            <strong>5. Automatic Detection:</strong> Over time, the system becomes better at
                            automatically detecting transfers based on learned patterns.
                        </Typography>
                    </Grid>
                </Grid>
            </Paper>

            <Tabs value={currentTab} onChange={(_, newValue) => setCurrentTab(newValue)} sx={{ mb: 3 }}>
                <Tab label={
                    <Box display="flex" alignItems="center" gap={1}>
                        <SmartToy />
                        <span>Suggestions ({suggestions.length})</span>
                    </Box>
                } />
                <Tab label={
                    <Box display="flex" alignItems="center" gap={1}>
                        <Timeline />
                        <span>Learned Patterns ({patterns.length})</span>
                    </Box>
                } />
            </Tabs>

            {currentTab === 0 && (
                <Box>
                    {suggestions.length === 0 ? (
                        <Paper sx={{ p: 4, textAlign: 'center' }}>
                            <SmartToy sx={{ fontSize: 48, color: 'action.disabled', mb: 2 }} />
                            <Typography variant="h6" color="textSecondary" gutterBottom>
                                No transfer suggestions found
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                No transactions categorized as "Account Transfers" found for review.
                                First categorize transactions as "Account Transfers" in the Review page, then return here to pair them.
                            </Typography>
                        </Paper>
                    ) : (
                        <>
                            {/* Summary Cards */}
                            <Grid container spacing={3} sx={{ mb: 3 }}>
                                <Grid item xs={12} md={4}>
                                    <Card>
                                        <CardContent>
                                            <Typography color="textSecondary" gutterBottom>
                                                High Confidence
                                            </Typography>
                                            <Typography variant="h4" color="success.main">
                                                {highConfidenceSuggestions.length}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <Card>
                                        <CardContent>
                                            <Typography color="textSecondary" gutterBottom>
                                                Medium Confidence
                                            </Typography>
                                            <Typography variant="h4" color="warning.main">
                                                {mediumConfidenceSuggestions.length}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <Card>
                                        <CardContent>
                                            <Typography color="textSecondary" gutterBottom>
                                                Low Confidence
                                            </Typography>
                                            <Typography variant="h4" color="error.main">
                                                {lowConfidenceSuggestions.length}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>

                            {/* Suggestion Groups */}
                            {highConfidenceSuggestions && Array.isArray(highConfidenceSuggestions) && highConfidenceSuggestions.length > 0 && (
                                <Paper sx={{ mb: 3 }}>
                                    <Box sx={{ p: 2, backgroundColor: 'success.light', color: 'success.contrastText' }}>
                                        <Typography variant="h6">
                                            <CheckCircle sx={{ mr: 1 }} />
                                            High Confidence Suggestions
                                        </Typography>
                                    </Box>
                                    {highConfidenceSuggestions.map((suggestion, index) => (
                                        <SuggestionCard
                                            key={index}
                                            suggestion={suggestion}
                                            onConfirm={handleConfirmTransfer}
                                            accounts={accounts}
                                        />
                                    ))}
                                </Paper>
                            )}

                            {mediumConfidenceSuggestions && Array.isArray(mediumConfidenceSuggestions) && mediumConfidenceSuggestions.length > 0 && (
                                <Paper sx={{ mb: 3 }}>
                                    <Box sx={{ p: 2, backgroundColor: 'warning.light', color: 'warning.contrastText' }}>
                                        <Typography variant="h6">
                                            <Warning sx={{ mr: 1 }} />
                                            Medium Confidence Suggestions
                                        </Typography>
                                    </Box>
                                    {mediumConfidenceSuggestions.map((suggestion, index) => (
                                        <SuggestionCard
                                            key={index}
                                            suggestion={suggestion}
                                            onConfirm={handleConfirmTransfer}
                                            accounts={accounts}
                                        />
                                    ))}
                                </Paper>
                            )}

                            {lowConfidenceSuggestions.length > 0 && (
                                <Paper sx={{ mb: 3 }}>
                                    <Box sx={{ p: 2, backgroundColor: 'error.light', color: 'error.contrastText' }}>
                                        <Typography variant="h6">
                                            <Error sx={{ mr: 1 }} />
                                            Low Confidence Suggestions
                                        </Typography>
                                    </Box>
                                    {lowConfidenceSuggestions.map((suggestion, index) => (
                                        <SuggestionCard
                                            key={index}
                                            suggestion={suggestion}
                                            onConfirm={handleConfirmTransfer}
                                            accounts={accounts}
                                        />
                                    ))}
                                </Paper>
                            )}
                        </>
                    )}
                </Box>
            )}

            {currentTab === 1 && (
                <Box>
                    {patterns.length === 0 ? (
                        <Paper sx={{ p: 4, textAlign: 'center' }}>
                            <Timeline sx={{ fontSize: 48, color: 'action.disabled', mb: 2 }} />
                            <Typography variant="h6" color="textSecondary" gutterBottom>
                                No learned patterns yet
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                Patterns will appear here as you confirm transfer suggestions.
                                The system learns from your confirmations to improve future detection.
                            </Typography>
                        </Paper>
                    ) : (
                        <>
                            <Alert severity="info" sx={{ mb: 3 }}>
                                <Typography variant="body2">
                                    These patterns were learned from your confirmed transfers.
                                    You can adjust their settings or disable them as needed.
                                </Typography>
                            </Alert>

                            {patterns.map((pattern) => (
                                <PatternCard
                                    key={pattern.id}
                                    pattern={pattern}
                                    onEdit={handleOpenPatternSettings}
                                    onDelete={handleDeletePattern}
                                />
                            ))}
                        </>
                    )}
                </Box>
            )}

            {/* Transfer Confirmation Dialog */}
            <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <CompareArrows />
                        Confirm Transfer
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedSuggestion && (
                        <Box>
                            <Alert severity="info" sx={{ mb: 3 }}>
                                Confirming this transfer will link these transactions and help the system learn this pattern.
                            </Alert>

                            <Grid container spacing={3}>
                                <Grid item xs={12} md={5}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography variant="h6" color="error.main" gutterBottom>
                                                From Account
                                            </Typography>
                                            <Typography variant="body2" color="textSecondary">
                                                {getAccountName(selectedSuggestion.from_transaction.account_id)}
                                            </Typography>
                                            <Typography variant="body2">
                                                {selectedSuggestion.from_transaction.description}
                                            </Typography>
                                            <Typography variant="h6" color="error.main">
                                                -{formatCurrency(Math.abs(selectedSuggestion.from_transaction.amount))}
                                            </Typography>
                                            <Typography variant="body2" color="textSecondary">
                                                {new Date(selectedSuggestion.from_transaction.date).toLocaleDateString()}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>

                                <Grid item xs={12} md={2} display="flex" alignItems="center" justifyContent="center">
                                    <SwapHoriz color="primary" sx={{ fontSize: 32 }} />
                                </Grid>

                                <Grid item xs={12} md={5}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography variant="h6" color="success.main" gutterBottom>
                                                To Account
                                            </Typography>
                                            <Typography variant="body2" color="textSecondary">
                                                {getAccountName(selectedSuggestion.to_transaction.account_id)}
                                            </Typography>
                                            <Typography variant="body2">
                                                {selectedSuggestion.to_transaction.description}
                                            </Typography>
                                            <Typography variant="h6" color="success.main">
                                                +{formatCurrency(selectedSuggestion.to_transaction.amount)}
                                            </Typography>
                                            <Typography variant="body2" color="textSecondary">
                                                {new Date(selectedSuggestion.to_transaction.date).toLocaleDateString()}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>

                            <Box mt={3}>
                                <Typography variant="body2" color="textSecondary">
                                    <strong>Confidence:</strong> {(selectedSuggestion.confidence * 100).toFixed(1)}%
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                    <strong>Amount:</strong> {formatCurrency(selectedSuggestion.amount)}
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                    <strong>Date Difference:</strong> {selectedSuggestion.date_difference} days
                                </Typography>
                                {selectedSuggestion.matched_pattern && (
                                    <Typography variant="body2" color="textSecondary">
                                        <strong>Matched Pattern:</strong> {selectedSuggestion.matched_pattern}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setConfirmDialogOpen(false)}
                        startIcon={<Close />}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => handleCreateTransfer(false)}
                        color="primary"
                        startIcon={<Check />}
                        disabled={createTransferMutation.isPending}
                    >
                        Confirm Only
                    </Button>
                    <Button
                        onClick={() => handleCreateTransfer(true)}
                        variant="contained"
                        color="primary"
                        startIcon={<School />}
                        disabled={createTransferMutation.isPending}
                    >
                        Confirm & Learn Pattern
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Pattern Settings Dialog */}
            <Dialog open={patternSettingsOpen} onClose={() => setPatternSettingsOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Settings />
                        Pattern Settings
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedPattern && (
                        <Box>
                            <Typography variant="h6" gutterBottom>
                                {selectedPattern.pattern_name}
                            </Typography>

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={patternSettings.is_active}
                                        onChange={(e) => setPatternSettings({
                                            ...patternSettings,
                                            is_active: e.target.checked
                                        })}
                                    />
                                }
                                label="Active"
                                sx={{ mb: 2 }}
                            />

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={patternSettings.auto_confirm}
                                        onChange={(e) => setPatternSettings({
                                            ...patternSettings,
                                            auto_confirm: e.target.checked
                                        })}
                                    />
                                }
                                label="Auto-confirm matches"
                                sx={{ mb: 2 }}
                            />

                            <Typography gutterBottom>
                                Confidence Threshold: {(patternSettings.confidence_threshold * 100).toFixed(0)}%
                            </Typography>
                            <Slider
                                value={patternSettings.confidence_threshold}
                                onChange={(_, value) => setPatternSettings({
                                    ...patternSettings,
                                    confidence_threshold: value as number
                                })}
                                min={0.5}
                                max={1.0}
                                step={0.05}
                                sx={{ mb: 2 }}
                            />

                            <Typography gutterBottom>
                                Amount Tolerance: {(patternSettings.amount_tolerance * 100).toFixed(0)}%
                            </Typography>
                            <Slider
                                value={patternSettings.amount_tolerance}
                                onChange={(_, value) => setPatternSettings({
                                    ...patternSettings,
                                    amount_tolerance: value as number
                                })}
                                min={0.01}
                                max={0.2}
                                step={0.01}
                                sx={{ mb: 2 }}
                            />

                            <TextField
                                label="Max Days Between Transactions"
                                type="number"
                                value={patternSettings.max_days_between}
                                onChange={(e) => setPatternSettings({
                                    ...patternSettings,
                                    max_days_between: parseInt(e.target.value) || 3
                                })}
                                fullWidth
                                sx={{ mb: 2 }}
                            />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPatternSettingsOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUpdatePattern}
                        variant="contained"
                        disabled={updatePatternMutation.isPending}
                    >
                        Update Pattern
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

// Suggestion Card Component
const SuggestionCard: React.FC<{
    suggestion: TransferSuggestion;
    onConfirm: (suggestion: TransferSuggestion) => void;
    accounts: Account[];
}> = ({ suggestion, onConfirm, accounts }) => {
    const [expanded, setExpanded] = useState(false);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF',
        }).format(amount);
    };

    const getAccountName = (accountId: string) => {
        const account = accounts.find((a: Account) => a.id === accountId);
        return account ? account.name : 'Unknown Account';
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.9) return 'success';
        if (confidence >= 0.7) return 'warning';
        return 'error';
    };

    return (
        <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)}>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Box display="flex" alignItems="center" gap={2} width="100%">
                    <Chip
                        label={`${(suggestion.confidence * 100).toFixed(0)}%`}
                        color={getConfidenceColor(suggestion.confidence) as any}
                        size="small"
                    />
                    <Typography variant="body1" sx={{ flexGrow: 1 }}>
                        {formatCurrency(suggestion.amount)} • {getAccountName(suggestion.from_transaction.account_id)} → {getAccountName(suggestion.to_transaction.account_id)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        {new Date(suggestion.from_transaction.date).toLocaleDateString()}
                    </Typography>
                </Box>
            </AccordionSummary>
            <AccordionDetails>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={5}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="subtitle2" color="error.main">
                                    FROM: {getAccountName(suggestion.from_transaction.account_id)}
                                </Typography>
                                <Typography variant="body2">
                                    {suggestion.from_transaction.description}
                                </Typography>
                                <Typography variant="h6" color="error.main">
                                    -{formatCurrency(Math.abs(suggestion.from_transaction.amount))}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid item xs={12} md={2} display="flex" alignItems="center" justifyContent="center">
                        <SwapHoriz color="primary" />
                    </Grid>

                    <Grid item xs={12} md={5}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="subtitle2" color="success.main">
                                    TO: {getAccountName(suggestion.to_transaction.account_id)}
                                </Typography>
                                <Typography variant="body2">
                                    {suggestion.to_transaction.description}
                                </Typography>
                                <Typography variant="h6" color="success.main">
                                    +{formatCurrency(suggestion.to_transaction.amount)}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
                    <Box>
                        <Typography variant="body2" color="textSecondary">
                            Date difference: {suggestion.date_difference} days
                        </Typography>
                        {suggestion.matched_pattern && (
                            <Typography variant="body2" color="textSecondary">
                                Matched pattern: {suggestion.matched_pattern}
                            </Typography>
                        )}
                    </Box>
                    <Box>
                        <Button
                            variant="contained"
                            color="primary"
                            startIcon={<CheckCircle />}
                            onClick={() => onConfirm(suggestion)}
                        >
                            Confirm Transfer
                        </Button>
                    </Box>
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

// Pattern Card Component
const PatternCard: React.FC<{
    pattern: TransferPattern;
    onEdit: (pattern: TransferPattern) => void;
    onDelete: (patternId: string) => void;
}> = ({ pattern, onEdit, onDelete }) => {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('de-CH', {
            style: 'currency',
            currency: 'CHF',
        }).format(amount);
    };

    const getPatternStatusIcon = (pattern: TransferPattern) => {
        if (!pattern.is_active) return <VisibilityOff color="disabled" />;
        if (pattern.auto_confirm) return <CheckCircle color="success" />;
        return <Visibility color="primary" />;
    };

    return (
        <Card sx={{ mb: 2 }}>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="start">
                    <Box>
                        <Typography variant="h6" gutterBottom>
                            {getPatternStatusIcon(pattern)}
                            <span style={{ marginLeft: 8 }}>{pattern.pattern_name}</span>
                        </Typography>

                        <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="body2" color="textSecondary">
                                    <strong>From:</strong> {pattern.from_account_pattern}
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                    <strong>To:</strong> {pattern.to_account_pattern}
                                </Typography>
                                {pattern.typical_amount && (
                                    <Typography variant="body2" color="textSecondary">
                                        <strong>Typical Amount:</strong> {formatCurrency(pattern.typical_amount)}
                                    </Typography>
                                )}
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Typography variant="body2" color="textSecondary">
                                    <strong>Matches:</strong> {pattern.times_matched}
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                    <strong>Confidence:</strong> {(pattern.confidence_threshold * 100).toFixed(0)}%
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                    <strong>Auto-confirm:</strong> {pattern.auto_confirm ? 'Yes' : 'No'}
                                </Typography>
                            </Grid>
                        </Grid>
                    </Box>

                    <Box>
                        <IconButton onClick={() => onEdit(pattern)} size="small">
                            <Edit />
                        </IconButton>
                        <IconButton onClick={() => onDelete(pattern.id)} size="small" color="error">
                            <Delete />
                        </IconButton>
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
};

export default TransferReview;
