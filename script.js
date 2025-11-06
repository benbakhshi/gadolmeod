const properties = [
  {
    name: 'I-30 Logistics Center',
    market: 'Dallas-Fort Worth, TX',
    rentableSf: 950000,
    occupancy: 0.98,
    topTenant: 'Amazon Last-Mile',
    entityId: 'gm-industrial-trust-i',
    valuation: 192000000
  },
  {
    name: 'Midwest Consolidation Hub',
    market: 'Columbus, OH',
    rentableSf: 720000,
    occupancy: 0.95,
    topTenant: 'FedEx Supply Chain',
    entityId: 'gm-industrial-trust-i',
    valuation: 131000000
  },
  {
    name: 'Portside Distribution Campus',
    market: 'Savannah, GA',
    rentableSf: 580000,
    occupancy: 1,
    topTenant: 'Maersk Logistics',
    entityId: 'gm-southeast-logistics',
    valuation: 118000000
  },
  {
    name: 'Sky Harbor Air Cargo',
    market: 'Phoenix, AZ',
    rentableSf: 460000,
    occupancy: 0.92,
    topTenant: 'UPS',
    entityId: 'gm-western-facilities',
    valuation: 87000000
  },
  {
    name: 'Inland Empire Cross-Dock',
    market: 'Riverside, CA',
    rentableSf: 1210000,
    occupancy: 0.99,
    topTenant: 'XPO Logistics',
    entityId: 'gm-western-facilities',
    valuation: 265000000
  },
  {
    name: 'Great Lakes Fulfillment',
    market: 'Chicago, IL',
    rentableSf: 880000,
    occupancy: 0.94,
    topTenant: 'Grainger',
    entityId: 'gm-industrial-trust-ii',
    valuation: 174000000
  },
  {
    name: 'Sunbelt Distribution Park',
    market: 'Atlanta, GA',
    rentableSf: 690000,
    occupancy: 0.97,
    topTenant: 'PepsiCo',
    entityId: 'gm-southeast-logistics',
    valuation: 142500000
  },
  {
    name: 'Gulf Coast Cold Storage',
    market: 'Houston, TX',
    rentableSf: 410000,
    occupancy: 0.9,
    topTenant: 'Lineage Logistics',
    entityId: 'gm-industrial-trust-ii',
    valuation: 89000000
  },
  {
    name: 'Northern Plains E-Commerce Node',
    market: 'Minneapolis, MN',
    rentableSf: 375000,
    occupancy: 0.93,
    topTenant: 'Target Corp',
    entityId: 'gm-industrial-trust-ii',
    valuation: 67000000
  },
  {
    name: 'I-95 Corridor Mega Center',
    market: 'Newark, NJ',
    rentableSf: 1330000,
    occupancy: 0.99,
    topTenant: 'Chewy.com',
    entityId: 'gm-northeast-holdings',
    valuation: 318000000
  },
  {
    name: 'Bluegrass Industrial Flex',
    market: 'Louisville, KY',
    rentableSf: 280000,
    occupancy: 0.91,
    topTenant: 'GE Appliances',
    entityId: 'gm-industrial-trust-i',
    valuation: 42000000
  },
  {
    name: 'Rocky Mountain Logistics Depot',
    market: 'Denver, CO',
    rentableSf: 540000,
    occupancy: 0.96,
    topTenant: 'Walmart Fulfillment',
    entityId: 'gm-western-facilities',
    valuation: 109000000
  }
];

const entities = [
  {
    id: 'gm-industrial-trust-i',
    name: 'GM Industrial Trust I',
    type: 'Master Holding Company',
    description: 'Core portfolio vehicle targeting institutional-grade assets across primary logistics markets with conservative leverage.',
    commitments: '$420M Equity',
    leverage: '48% LTV',
    debtPartners: 'First National Bank, Fifth Third',
    governance: 'Quarterly advisory board review with independent directors.'
  },
  {
    id: 'gm-industrial-trust-ii',
    name: 'GM Industrial Trust II',
    type: 'Value-Add Fund',
    description: 'Focus on repositioning and lease-up of class B industrial assets transitioning to last-mile delivery nodes.',
    commitments: '$265M Equity',
    leverage: '52% LTV',
    debtPartners: 'CIBC, Truist, Ladder Capital',
    governance: 'Monthly construction risk committee, annual third-party valuations.'
  },
  {
    id: 'gm-southeast-logistics',
    name: 'GM Southeast Logistics JV',
    type: 'Joint Venture',
    description: 'Partnership with Sunbelt Pension Trust targeting port-proximate warehousing throughout the Southeast corridor.',
    commitments: '$180M Equity',
    leverage: '50% LTV',
    debtPartners: 'Regions Bank, MetLife',
    governance: 'JV board with unanimous consent for major decisions.'
  },
  {
    id: 'gm-western-facilities',
    name: 'GM Western Facilities REIT',
    type: 'Private REIT',
    description: 'Tax-efficient platform aggregating West Coast cross-dock distribution properties serving the entertainment and e-commerce sectors.',
    commitments: '$320M Equity',
    leverage: '45% LTV',
    debtPartners: 'Wells Fargo, East West Bank',
    governance: 'REIT board meets bi-monthly with independent audit chair.'
  },
  {
    id: 'gm-northeast-holdings',
    name: 'GM Northeast Holdings LP',
    type: 'Limited Partnership',
    description: 'Institutional partnership consolidating high-barrier urban fulfillment centers along the I-95 corridor.',
    commitments: '$280M Equity',
    leverage: '49% LTV',
    debtPartners: 'JP Morgan, Bank of Montreal',
    governance: 'Limited partner committee rights with quarterly reporting cadence.'
  }
];

const taxReturns = [
  {
    year: '2023',
    entity: 'GM Industrial Trust I',
    status: 'Filed',
    delivery: 'March 12, 2024',
    access: '<a href="#contact">Investor portal download</a>',
    notes: 'Includes consolidated federal and 9 state filings.'
  },
  {
    year: '2023',
    entity: 'GM Western Facilities REIT',
    status: 'Filed',
    delivery: 'March 8, 2024',
    access: '<a href="#contact">Request REIT supplement</a>',
    notes: 'REIT return with state composite elections for CA, AZ, and NV investors.'
  },
  {
    year: '2022',
    entity: 'GM Southeast Logistics JV',
    status: 'Filed',
    delivery: 'September 15, 2023',
    access: '<a href="#contact">Archive request</a>',
    notes: 'Extended filing to incorporate Savannah Campus expansion.'
  },
  {
    year: '2021',
    entity: 'GM Northeast Holdings LP',
    status: 'Filed',
    delivery: 'August 29, 2022',
    access: '<a href="#contact">Archive request</a>',
    notes: 'Historical return retained for lender diligence refresh.'
  }
];

const llcFilings = [
  {
    filing: 'GM Industrial Trust I Annual Report',
    jurisdiction: 'Delaware',
    status: 'Accepted',
    updated: 'March 1, 2024',
    access: '<a href="#contact">Certificate of status</a>',
    notes: 'Registered agent: Corporation Service Company.'
  },
  {
    filing: 'GM Southeast Logistics JV Foreign Registration',
    jurisdiction: 'Georgia',
    status: 'Active',
    updated: 'February 20, 2024',
    access: '<a href="#contact">Secretary of State receipt</a>',
    notes: 'Includes Port of Savannah lease rider.'
  },
  {
    filing: 'GM Western Facilities REIT Annual List',
    jurisdiction: 'Nevada',
    status: 'Accepted',
    updated: 'January 18, 2024',
    access: '<a href="#contact">Filed annual list</a>',
    notes: 'Trustee certification refreshed for 2024.'
  },
  {
    filing: 'GM Northeast Holdings LP Foreign Qualification',
    jurisdiction: 'New Jersey',
    status: 'Renewed',
    updated: 'December 5, 2023',
    access: '<a href="#contact">Standing certificate</a>',
    notes: 'Required for I-95 Corridor Mega Center financing extension.'
  }
];

const investorK1s = [
  {
    year: '2023',
    entity: 'GM Industrial Trust I',
    distributionDate: 'March 25, 2024',
    access: '<a href="#contact">Secure portal</a>',
    notes: 'Electronic delivery with DocuSign acknowledgement.'
  },
  {
    year: '2023',
    entity: 'GM Southeast Logistics JV',
    distributionDate: 'March 27, 2024',
    access: '<a href="#contact">Secure portal</a>',
    notes: 'Composite election options included for non-resident investors.'
  },
  {
    year: '2022',
    entity: 'GM Northeast Holdings LP',
    distributionDate: 'March 30, 2023',
    access: '<a href="#contact">Archive request</a>',
    notes: 'Amended filing issued for cost-recovery allocations.'
  }
];

const guarantorStatements = [
  {
    guarantor: 'Naomi Levinson',
    statementDate: 'February 29, 2024',
    netWorth: 168500000,
    liquidity: 48200000,
    notes: 'Includes pledged securities schedule and contingent liabilities summary.',
    access: '<a href="#contact">Secure transmission</a>'
  },
  {
    guarantor: 'Eli Rothman',
    statementDate: 'February 15, 2024',
    netWorth: 126000000,
    liquidity: 36500000,
    notes: 'Liquidity statement reconciles to JPMorgan private bank balances.',
    access: '<a href="#contact">Secure transmission</a>'
  },
  {
    guarantor: 'Gadol Meod Holdings Family Trust',
    statementDate: 'January 31, 2024',
    netWorth: 214000000,
    liquidity: 59800000,
    notes: 'Trustee attestation provided by Northern Trust corporate fiduciary.',
    access: '<a href="#contact">Secure transmission</a>'
  }
];

const liquiditySummary = {
  unrestrictedCash: 146000000,
  revolverAvailability: 185000000,
  restrictedCash: 12000000,
  nearTermMaturities: 56000000,
  weightedAverageInterest: 0.043,
  liquidityCoverageRatio: 3.4
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function populateEntityFilter() {
  const filter = document.getElementById('entity-filter');
  entities.forEach((entity) => {
    const option = document.createElement('option');
    option.value = entity.id;
    option.textContent = entity.name;
    filter.appendChild(option);
  });
}

function renderProperties(propertyList) {
  const tbody = document.getElementById('property-tbody');
  tbody.innerHTML = '';

  if (!propertyList.length) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="7">No properties match the current filters.</td>
    `;
    tbody.appendChild(emptyRow);
    return;
  }

  propertyList.forEach((property) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <th scope="row">${property.name}</th>
      <td>${property.market}</td>
      <td>${numberFormatter.format(property.rentableSf)}</td>
      <td>${percentFormatter.format(property.occupancy)}</td>
      <td>${property.topTenant}</td>
      <td>${entityName(property.entityId)}</td>
      <td>${currencyFormatter.format(property.valuation)}</td>
    `;
    tbody.appendChild(row);
  });
}

function entityName(entityId) {
  return entities.find((entity) => entity.id === entityId)?.name ?? '—';
}

function updatePortfolioSummary(propertyList) {
  const totalValuation = propertyList.reduce((sum, property) => sum + property.valuation, 0);
  const totalSf = propertyList.reduce((sum, property) => sum + property.rentableSf, 0);
  const averageOccupancy = propertyList.reduce((sum, property) => sum + property.occupancy, 0) / propertyList.length || 0;

  document.getElementById('total-gav').textContent = currencyFormatter.format(totalValuation);
  document.getElementById('total-sf').textContent = `${numberFormatter.format(totalSf)} sq ft`;
  document.getElementById('average-occupancy').textContent = percentFormatter.format(averageOccupancy);
}

function renderEntities() {
  const tbody = document.getElementById('entity-tbody');
  tbody.innerHTML = '';

  entities.forEach((entity) => {
    const infoRow = document.createElement('tr');
    infoRow.innerHTML = `
      <th scope="row">${entity.name}</th>
      <td>${entity.type}</td>
      <td>${entity.commitments}</td>
      <td>${entity.leverage}</td>
      <td>${entity.debtPartners}</td>
    `;

    const detailRow = document.createElement('tr');
    detailRow.className = 'entity-detail-row';
    detailRow.innerHTML = `
      <td colspan="5">${entity.description} ${entity.governance}</td>
    `;

    tbody.appendChild(infoRow);
    tbody.appendChild(detailRow);
  });
}

function renderTaxReturns() {
  const tbody = document.getElementById('tax-returns-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  taxReturns.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <th scope="row">${item.year}</th>
      <td>${item.entity}</td>
      <td>${item.status}</td>
      <td>${item.delivery}</td>
      <td>${item.access}</td>
      <td>${item.notes}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderLlcFilings() {
  const tbody = document.getElementById('llc-filings-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  llcFilings.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <th scope="row">${item.filing}</th>
      <td>${item.jurisdiction}</td>
      <td>${item.status}</td>
      <td>${item.updated}</td>
      <td>${item.access}</td>
      <td>${item.notes}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderK1s() {
  const tbody = document.getElementById('k1-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  investorK1s.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <th scope="row">${item.year}</th>
      <td>${item.entity}</td>
      <td>${item.distributionDate}</td>
      <td>${item.access}</td>
      <td>${item.notes}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderGuarantorStatements() {
  const tbody = document.getElementById('guarantor-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  guarantorStatements.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <th scope="row">${item.guarantor}</th>
      <td>${item.statementDate}</td>
      <td>${currencyFormatter.format(item.netWorth)}</td>
      <td>${currencyFormatter.format(item.liquidity)}</td>
      <td>${item.notes}</td>
      <td>${item.access}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderLiquidity() {
  const tbody = document.getElementById('liquidity-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const rows = [
    {
      label: 'Unrestricted Cash & Equivalents',
      value: currencyFormatter.format(liquiditySummary.unrestrictedCash)
    },
    {
      label: 'Available Revolver Capacity',
      value: currencyFormatter.format(liquiditySummary.revolverAvailability)
    },
    {
      label: 'Restricted Cash (Lender Reserves)',
      value: currencyFormatter.format(liquiditySummary.restrictedCash)
    },
    {
      label: 'Near-Term Debt Maturities (12 months)',
      value: currencyFormatter.format(liquiditySummary.nearTermMaturities)
    },
    {
      label: 'Weighted Average Interest Cost',
      value: percentFormatter.format(liquiditySummary.weightedAverageInterest)
    },
    {
      label: 'Liquidity Coverage Ratio',
      value: `${liquiditySummary.liquidityCoverageRatio.toFixed(1)}x`
    }
  ];

  rows.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <th scope="row">${item.label}</th>
      <td>${item.value}</td>
    `;
    tbody.appendChild(row);
  });
}

function applyFilters() {
  const searchTerm = document.getElementById('property-search').value.trim().toLowerCase();
  const entityFilter = document.getElementById('entity-filter').value;

  const filtered = properties.filter((property) => {
    const matchesSearch = [
      property.name,
      property.market,
      property.topTenant,
      entityName(property.entityId)
    ]
      .some((field) => field.toLowerCase().includes(searchTerm));

    const matchesEntity = entityFilter === 'all' || property.entityId === entityFilter;
    return matchesSearch && matchesEntity;
  });

  renderProperties(filtered);
  updatePortfolioSummary(filtered);
}

function setupFilters() {
  const searchInput = document.getElementById('property-search');
  const entitySelect = document.getElementById('entity-filter');

  searchInput.addEventListener('input', applyFilters);
  entitySelect.addEventListener('change', applyFilters);
}

function setCurrentYear() {
  const yearElement = document.getElementById('current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
}

function initialize() {
  populateEntityFilter();
  renderProperties(properties);
  updatePortfolioSummary(properties);
  renderEntities();
  renderTaxReturns();
  renderLlcFilings();
  renderK1s();
  renderGuarantorStatements();
  renderLiquidity();
  setupFilters();
  setCurrentYear();
}

document.addEventListener('DOMContentLoaded', initialize);
