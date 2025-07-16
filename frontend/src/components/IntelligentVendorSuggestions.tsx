// frontend/src/components/IntelligentVendorSuggestions.tsx
import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Chip,
    Card,
    CardContent,
    List,
    ListItem,
    ListItemText,
    ListItemButton,
    Divider,
    Alert,
    CircularProgress,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    LinearProgress,
    Tooltip,
    IconButton,
} from '@mui/material';
import {
    ExpandMore,
    Group,
    TrendingUp,
    Psychology,
    AccountTree,
    Info,
    AutoAwesome,
} from '@mui/icons-material';
import { apiClient } from '../services/api';

interface VendorSuggestion {
    vendor_id: string;
    vendor_name: string;
    category_id?: string;
    similarity: number;
    combined_confidence: number;
    ngram_confidence: number;
    match_type: string;
    ngram_type: string;
    is_hierarchical_match: boolean;
    potential_siblings: Array<{
        vendor_id: string;
        vendor_name: string;
        shared_parent: string;
        similarity: number;
    }>;
    is_part_of_group: boolean;
    matching_ngram: string;
    extracted_vendor: string;
}

interface ComprehensiveAnalysis {
    extracted_vendor_text: string;
    suggested_new_vendor_name: string;
    top_ngrams: Array<{
        pattern: string;
        confidence: number;
        type: string;
        length: number;
    }>;
    existing_vendor_matches: VendorSuggestion[];
    should_create_new: boolean;
    hierarchy_analysis: {
        can_join_existing_group: boolean;
        suggested_parent?: string;
        potential_children: string[];
        hierarchy_confidence: number;
    };
}

interface Props {
    open: boolean;
    onClose: () => void;
    transaction: any;
    onSelectVendor: (vendorId: string, categoryId?: string, vendorName?: string) => void;
    onCreateNewVendor: (vendorName: string) => void;
}

const IntelligentVendorSuggestions: React.FC<Props> = ({
    open,
    onClose,
    transaction,
    onSelectVendor,
    onCreateNewVendor,
}) => {
    const [analysis, setAnalysis] = useState<ComprehensiveAnalysis | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedTab, setSelectedTab] = useState<'suggestions' | 'analysis' | 'ngrams'>('suggestions');

    useEffect(() => {
        if (open && transaction) {
            loadComprehensiveAnalysis();
        }
    }, [open, transaction]);

    const loadComprehensiveAnalysis = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await apiClient.getComprehensiveVendorSuggestion(transaction.description);
            setAnalysis(response.data.analysis);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to load vendor analysis');
        } finally {
            setLoading(false);
        }
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.8) return 'success';
        if (confidence >= 0.6) return 'warning';
        return 'error';
    };

    const getMatchTypeIcon = (matchType: string, isHierarchical: boolean) => {
        if (isHierarchical) return <AccountTree color="primary" />;
        if (matchType === 'pattern') return <Psychology color="secondary" />;
        return <TrendingUp color="action" />;
    };

    const renderSuggestionCard = (suggestion: VendorSuggestion, index: number) => (
        <Card
            key={suggestion.vendor_id}
            variant={index === 0 ? "outlined" : "elevation"}
            sx={{
                mb: 2,
                border: index === 0 ? 2 : 1,
                borderColor: index === 0 ? 'primary.main' : 'grey.300',
                background: suggestion.is_hierarchical_match ? 'linear-gradient(45deg, #f3e5f5, #fafafa)' : 'background.paper'
            }}
        >
            <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                    {getMatchTypeIcon(suggestion.match_type, suggestion.is_hierarchical_match)}
                    <Typography variant="h6" component="div" flexGrow={1}>
                        {suggestion.vendor_name}
                    </Typography>
                    <Chip
                        label={`${(suggestion.combined_confidence * 100).toFixed(0)}%`}
                        color={getConfidenceColor(suggestion.combined_confidence)}
                        size="small"
                    />
                    {index === 0 && (
                        <Chip label="Best Match" color="primary" size="small" />
                    )}
                </Box>

                <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                    <Chip
                        label={`${suggestion.match_type} match`}
                        variant="outlined"
                        size="small"
                    />
                    <Chip
                        label={suggestion.ngram_type}
                        variant="outlined"
                        size="small"
                    />
                    {suggestion.is_hierarchical_match && (
                        <Chip
                            label="Hierarchical"
                            color="secondary"
                            size="small"
                            icon={<AccountTree />}
                        />
                    )}
                    {suggestion.is_part_of_group && (
                        <Chip
                            label="Part of Group"
                            color="info"
                            size="small"
                            icon={<Group />}
                        />
                    )}
                </Box>

                <Typography variant="body2" color="textSecondary" mb={1}>
                    Matching pattern: <strong>{suggestion.matching_ngram}</strong>
                </Typography>

                {suggestion.potential_siblings && Array.isArray(suggestion.potential_siblings) && suggestion.potential_siblings.length > 0 && (
                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMore />}>
                            <Typography variant="body2">
                                Related vendors ({suggestion.potential_siblings.length})
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <List dense>
                                {suggestion.potential_siblings.map((sibling) => (
                                    <ListItem key={sibling.vendor_id}>
                                        <ListItemText
                                            primary={sibling.vendor_name}
                                            secondary={`Shared: ${sibling.shared_parent} (${(sibling.similarity * 100).toFixed(0)}% similar)`}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </AccordionDetails>
                    </Accordion>
                )}

                <Box mt={2} display="flex" gap={1}>
                    <Button
                        variant={index === 0 ? "contained" : "outlined"}
                        color="primary"
                        onClick={() => onSelectVendor(suggestion.vendor_id, suggestion.category_id, suggestion.vendor_name)}
                        startIcon={<AutoAwesome />}
                    >
                        Use This Vendor
                    </Button>
                </Box>
            </CardContent>
        </Card>
    );

    const renderNgramAnalysis = () => {
        if (!analysis?.top_ngrams || !Array.isArray(analysis.top_ngrams) || analysis.top_ngrams.length === 0) return null;

        return (
            <Box>
                <Typography variant="h6" gutterBottom>
                    Pattern Analysis (N-grams)
                </Typography>
                <Typography variant="body2" color="textSecondary" mb={2}>
                    Breaking down "{analysis.extracted_vendor_text}" into patterns:
                </Typography>

                {analysis.top_ngrams.map((ngram, index) => (
                    <Card key={index} variant="outlined" sx={{ mb: 1 }}>
                        <CardContent sx={{ py: 1 }}>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Typography variant="body1" fontWeight="bold">
                                    "{ngram.pattern}"
                                </Typography>
                                <LinearProgress
                                    variant="determinate"
                                    value={ngram.confidence * 100}
                                    sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                                    color={getConfidenceColor(ngram.confidence)}
                                />
                                <Typography variant="body2">
                                    {(ngram.confidence * 100).toFixed(0)}%
                                </Typography>
                                <Chip
                                    label={ngram.type.replace('_', ' ')}
                                    size="small"
                                    variant="outlined"
                                />
                                <Chip
                                    label={`${ngram.length}-gram`}
                                    size="small"
                                    color="secondary"
                                />
                            </Box>
                        </CardContent>
                    </Card>
                ))}
            </Box>
        );
    };

    const renderHierarchyAnalysis = () => {
        if (!analysis?.hierarchy_analysis) return null;

        const { hierarchy_analysis } = analysis;

        return (
            <Box>
                <Typography variant="h6" gutterBottom>
                    Hierarchy Analysis
                </Typography>

                {hierarchy_analysis.can_join_existing_group ? (
                    <Alert severity="info" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                            This vendor could be part of the <strong>{hierarchy_analysis.suggested_parent}</strong> group
                            (confidence: {(hierarchy_analysis.hierarchy_confidence * 100).toFixed(0)}%)
                        </Typography>
                    </Alert>
                ) : (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                            No clear parent group found. This might be a new vendor.
                        </Typography>
                    </Alert>
                )}

                {hierarchy_analysis.potential_children && Array.isArray(hierarchy_analysis.potential_children) && hierarchy_analysis.potential_children.length > 0 && (
                    <Box>
                        <Typography variant="subtitle2" gutterBottom>
                            Potential Related Vendors:
                        </Typography>
                        <Box display="flex" gap={1} flexWrap="wrap">
                            {hierarchy_analysis.potential_children.map((child, index) => (
                                <Chip key={index} label={child} variant="outlined" size="small" />
                            ))}
                        </Box>
                    </Box>
                )}
            </Box>
        );
    };

    if (!analysis && !loading) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" gap={1}>
                    <Psychology color="primary" />
                    Intelligent Vendor Suggestions
                    <Tooltip title="Using n-gram windowing and hierarchical analysis">
                        <IconButton size="small">
                            <Info />
                        </IconButton>
                    </Tooltip>
                </Box>
            </DialogTitle>

            <DialogContent>
                {loading && (
                    <Box display="flex" alignItems="center" gap={2} py={4}>
                        <CircularProgress size={24} />
                        <Typography>Analyzing vendor patterns...</Typography>
                    </Box>
                )}

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {analysis && (
                    <Box>
                        <Typography variant="body2" color="textSecondary" gutterBottom>
                            Transaction: {transaction.description}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" mb={3}>
                            Extracted vendor: <strong>{analysis.extracted_vendor_text}</strong>
                        </Typography>

                        {/* Tab Navigation */}
                        <Box display="flex" gap={1} mb={3}>
                            <Button
                                variant={selectedTab === 'suggestions' ? 'contained' : 'outlined'}
                                onClick={() => setSelectedTab('suggestions')}
                                startIcon={<Group />}
                            >
                                Suggestions ({analysis.existing_vendor_matches && Array.isArray(analysis.existing_vendor_matches) ? analysis.existing_vendor_matches.length : 0})
                            </Button>
                            <Button
                                variant={selectedTab === 'analysis' ? 'contained' : 'outlined'}
                                onClick={() => setSelectedTab('analysis')}
                                startIcon={<AccountTree />}
                            >
                                Hierarchy
                            </Button>
                            <Button
                                variant={selectedTab === 'ngrams' ? 'contained' : 'outlined'}
                                onClick={() => setSelectedTab('ngrams')}
                                startIcon={<Psychology />}
                            >
                                Patterns
                            </Button>
                        </Box>

                        {/* Tab Content */}
                        {selectedTab === 'suggestions' && (
                            <Box>
                                {analysis.existing_vendor_matches && Array.isArray(analysis.existing_vendor_matches) && analysis.existing_vendor_matches.length > 0 ? (
                                    <Box>
                                        <Typography variant="h6" gutterBottom>
                                            Suggested Vendors
                                        </Typography>
                                        {analysis.existing_vendor_matches.map((suggestion, index) =>
                                            renderSuggestionCard(suggestion, index)
                                        )}
                                    </Box>
                                ) : (
                                    <Alert severity="info" sx={{ mb: 2 }}>
                                        No similar vendors found. Consider creating a new vendor.
                                    </Alert>
                                )}

                                {analysis.should_create_new && (
                                    <Card variant="outlined" sx={{ mt: 2, bgcolor: 'grey.50' }}>
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>
                                                Create New Vendor
                                            </Typography>
                                            <Typography variant="body2" color="textSecondary" mb={2}>
                                                Suggested name: <strong>{analysis.suggested_new_vendor_name}</strong>
                                            </Typography>
                                            <Button
                                                variant="contained"
                                                color="secondary"
                                                onClick={() => onCreateNewVendor(analysis.suggested_new_vendor_name)}
                                                startIcon={<AutoAwesome />}
                                            >
                                                Create New Vendor
                                            </Button>
                                        </CardContent>
                                    </Card>
                                )}
                            </Box>
                        )}

                        {selectedTab === 'analysis' && renderHierarchyAnalysis()}
                        {selectedTab === 'ngrams' && renderNgramAnalysis()}
                    </Box>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default IntelligentVendorSuggestions;
