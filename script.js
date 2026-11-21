/* =====================================================================
   Kimia Farma | Business Performance Analytics
   Project Stone — browser-side CSV processing
   Final source files: index.html, script.js, style.css
   ===================================================================== */
'use strict';

const DATA_FILES = {
  transactions: 'kf_final_transaction.csv',
  branches: 'kf_kantor_cabang.csv',
  products: 'kf_product.csv',
  inventory: 'kf_inventory.csv'
};

const COLORS = {
  forest: '#087568', forestDark: '#075e55', forestSoft: '#dcebe5',
  navy: '#142c3e', orange: '#e78b46', blue: '#6689a0',
  text: '#172b28', muted: '#71817d', grid: '#e7eeeb', white: '#ffffff'
};

const PAGE_META = {
  overview: {
    title: 'Overview', eyebrow: 'EXECUTIVE VIEW',
    heading: 'Business performance overview',
    description: 'Ringkasan kinerja penjualan, jaringan cabang, dan pengalaman pelanggan.'
  },
  sales: {
    title: 'Sales analytics', eyebrow: 'REVENUE PERFORMANCE',
    heading: 'Sales performance',
    description: 'Telusuri tren penjualan, perbandingan tahunan, dan pola diskon transaksi.'
  },
  regional: {
    title: 'Regional analytics', eyebrow: 'BRANCH NETWORK',
    heading: 'Regional & branch performance',
    description: 'Bandingkan kontribusi penjualan dan rating transaksi antarwilayah serta cabang.'
  },
  product: {
    title: 'Product analytics', eyebrow: 'PRODUCT PORTFOLIO',
    heading: 'Product performance',
    description: 'Identifikasi kategori dan produk dengan kontribusi penjualan tertinggi.'
  },
  customer: {
    title: 'Customer experience', eyebrow: 'TRANSACTION FEEDBACK',
    heading: 'Customer experience signals',
    description: 'Pahami pola rating yang tercatat pada transaksi dan variasinya antarprovinsi.'
  },
  inventory: {
    title: 'Inventory records', eyebrow: 'STOCK OPNAME DATA',
    heading: 'Inventory record analysis',
    description: 'Ringkasan catatan opname berdasarkan kombinasi cabang dan produk.'
  }
};

const filter = { year: '', province: '', branchType: '', productCategory: '' };
const branchIndexById = new Map();
const productIndexById = new Map();
const branches = [];
const products = [];
const transactions = [];
const inventoryGroups = new Map();
const inventoryPairSet = new Set();
const chartInstances = new Map();

let dataBase = 'data/raw/';
let currentPage = 'overview';
let currentModel = null;
let inventoryRecordCount = 0;
let inventoryParseWarnings = 0;

const numberFormat = new Intl.NumberFormat('id-ID');
const decimalFormat = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/* ---------------------------------------------------------------------
   DOM and formatting helpers
   --------------------------------------------------------------------- */
function byId(id) { return document.getElementById(id); }
function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}
function formatNumber(value) {
  return numberFormat.format(Number.isFinite(value) ? value : 0);
}
function formatPercent(value, digits = 2) {
  return `${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
function formatRating(value) {
  return Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatRupiah(value) {
  if (!Number.isFinite(value)) return '—';
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}
function formatRupiahShort(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `Rp ${(value / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (abs >= 1e6) return `Rp ${(value / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (abs >= 1e3) return `Rp ${(value / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return formatRupiah(value);
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function setLoading(message, detail, percent) {
  setText('load-status', message);
  setText('load-detail', detail || '');
  const bar = byId('load-bar');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}
function showError(message) {
  byId('loading-screen')?.classList.add('hidden');
  byId('app')?.classList.add('hidden');
  byId('error-screen')?.classList.remove('hidden');
  setText('error-msg', message);
}
function revealApp() {
  byId('loading-screen')?.classList.add('hidden');
  byId('app')?.classList.remove('hidden');
}

/* ---------------------------------------------------------------------
   CSV loading — PapaParse chunk mode prevents retaining a second copy
   of the large CSV text in memory.
   --------------------------------------------------------------------- */
async function detectDataDirectory() {
  const candidates = ['data/raw/', ''];
  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${DATA_FILES.products}`, { cache: 'no-store' });
      if (response.ok) {
        await response.arrayBuffer(); // Product CSV is small; release the probe response.
        return base;
      }
    } catch (_) {
      // Try the next supported directory layout.
    }
  }
  throw new Error('File CSV tidak ditemukan. Letakkan file di folder data/raw/ atau sejajar dengan index.html.');
}

function parseSmallCSV(fileName) {
  const url = `${dataBase}${fileName}`;
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: 'greedy',
      complete(results) {
        if (results.errors?.length) {
          console.warn(`Peringatan parser pada ${fileName}:`, results.errors.slice(0, 3));
        }
        if (!results.data || !results.data.length) {
          reject(new Error(`${fileName} berhasil dibuka tetapi tidak berisi baris data.`));
          return;
        }
        resolve(results.data);
      },
      error(error) {
        reject(new Error(`Gagal membaca ${url}: ${error.message || error}`));
      }
    });
  });
}

function parseCSVInChunks(fileName, onRows, onProgress) {
  const url = `${dataBase}${fileName}`;
  return new Promise((resolve, reject) => {
    let rejected = false;
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: 'greedy',
      chunkSize: 1024 * 1024,
      chunk(results, parser) {
        if (results.errors?.length) {
          inventoryParseWarnings += results.errors.length;
          if (inventoryParseWarnings <= 3) console.warn(`Peringatan parsing ${fileName}:`, results.errors[0]);
        }
        try {
          onRows(results.data || []);
          if (onProgress) onProgress(results.meta?.cursor || 0);
        } catch (error) {
          rejected = true;
          parser.abort();
          reject(error);
        }
      },
      complete() {
        if (!rejected) resolve();
      },
      error(error) {
        if (!rejected) reject(new Error(`Gagal membaca ${url}: ${error.message || error}`));
      }
    });
  });
}

function parseDateParts(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
}

/* ---------------------------------------------------------------------
   Dimension tables
   --------------------------------------------------------------------- */
async function loadDimensions() {
  setLoading('Loading branch reference', 'Reading kf_kantor_cabang.csv', 5);
  const branchRows = await parseSmallCSV(DATA_FILES.branches);
  branchRows.forEach(row => {
    const id = String(row.branch_id ?? '').trim();
    if (!id) return;
    const index = branches.length;
    branchIndexById.set(id, index);
    branches.push({
      id,
      name: String(row.branch_name ?? id),
      city: String(row.kota ?? ''),
      province: String(row.provinsi ?? ''),
      type: String(row.branch_category ?? ''),
      rating: Number(row.rating)
    });
  });

  setLoading('Loading product reference', 'Reading kf_product.csv', 10);
  const productRows = await parseSmallCSV(DATA_FILES.products);
  productRows.forEach(row => {
    const id = String(row.product_id ?? '').trim();
    if (!id) return;
    const index = products.length;
    productIndexById.set(id, index);
    products.push({
      id,
      name: String(row.product_name ?? id),
      category: String(row.product_category ?? ''),
      listedPrice: Number(row.price)
    });
  });
}

/* ---------------------------------------------------------------------
   Inventory: aggregate record statistics by filterable dimensions.
   Do not sum repeated opname_stock entries into a supposed current stock.
   --------------------------------------------------------------------- */
function stockBucket(value) {
  if (value <= 0) return 0;
  if (value <= 10) return 1;
  if (value <= 25) return 2;
  if (value <= 50) return 3;
  if (value <= 75) return 4;
  if (value <= 100) return 5;
  return 6;
}

async function loadInventory() {
  const pairSet = inventoryPairSet;
  setLoading('Processing inventory records', 'Reading 1M+ opname records in chunks', 15);
  await parseCSVInChunks(DATA_FILES.inventory, rows => {
    rows.forEach(row => {
      const branchId = String(row.branch_id ?? '').trim();
      const productId = String(row.product_id ?? '').trim();
      const branchIndex = branchIndexById.get(branchId);
      const productIndex = productIndexById.get(productId);
      const stock = Number(row.opname_stock);
      if (branchIndex === undefined || productIndex === undefined || !Number.isFinite(stock)) return;

      const branch = branches[branchIndex];
      const product = products[productIndex];
      const groupKey = [branch.province, branch.type, product.category].join('\u001f');
      let group = inventoryGroups.get(groupKey);
      if (!group) {
        group = { province: branch.province, branchType: branch.type, productCategory: product.category, records: 0, uniquePairs: 0, zeroRecords: 0, bins: new Uint32Array(7) };
        inventoryGroups.set(groupKey, group);
      }

      group.records += 1;
      inventoryRecordCount += 1;
      if (stock === 0) group.zeroRecords += 1;
      group.bins[stockBucket(stock)] += 1;

      const pairKey = `${branchIndex}|${productIndex}`;
      if (!pairSet.has(pairKey)) {
        pairSet.add(pairKey);
        group.uniquePairs += 1;
      }
    });
  }, cursor => {
    const approximate = Math.min(28, Math.round((cursor / (84 * 1024 * 1024)) * 28));
    setLoading('Processing inventory records', `${formatNumber(inventoryRecordCount)} records processed`, 15 + approximate);
  });
}

/* ---------------------------------------------------------------------
   Transaction loading: retain only compact fields used by analytics.
   Customer names and transaction IDs are intentionally not retained.
   --------------------------------------------------------------------- */
async function loadTransactions() {
  let skippedRows = 0;
  setLoading('Processing transactions', 'Reading transaction records in chunks', 45);
  await parseCSVInChunks(DATA_FILES.transactions, rows => {
    rows.forEach(row => {
      const date = parseDateParts(row.date);
      const branchIndex = branchIndexById.get(String(row.branch_id ?? '').trim());
      const productIndex = productIndexById.get(String(row.product_id ?? '').trim());
      const price = Number(row.price);
      const discount = Number(row.discount_percentage);
      const rating = Number(row.rating);

      if (!date || branchIndex === undefined || productIndex === undefined || !Number.isFinite(price) || !Number.isFinite(discount)) {
        skippedRows += 1;
        return;
      }
      const monthIndex = date.year * 12 + date.month - 1;
      transactions.push([date.year, monthIndex, branchIndex, productIndex, price, discount, Number.isFinite(rating) ? rating : NaN]);
    });
  }, cursor => {
    const approximate = Math.min(32, Math.round((cursor / (41 * 1024 * 1024)) * 32));
    setLoading('Processing transactions', `${formatNumber(transactions.length)} transactions processed`, 45 + approximate);
  });

  if (skippedRows) console.warn(`${formatNumber(skippedRows)} transaction rows skipped because required fields or reference keys were invalid.`);
  if (!transactions.length) throw new Error('Tidak ada transaksi valid yang dapat diproses. Periksa isi dan relasi dataset.');
  console.info('Data quality check', {
    transactionsLoaded: transactions.length,
    branchReferenceRows: branches.length,
    productReferenceRows: products.length,
    inventoryRecordsLoaded: inventoryRecordCount,
    inventoryUniquePairs: inventoryPairSet.size,
    skippedTransactionRows: skippedRows
  });
}

/* ---------------------------------------------------------------------
   Filter values and dimension matching
   --------------------------------------------------------------------- */
function transactionMatches(row) {
  const [year, , branchIndex, productIndex] = row;
  const branch = branches[branchIndex];
  const product = products[productIndex];
  if (filter.year && String(year) !== filter.year) return false;
  if (filter.province && branch.province !== filter.province) return false;
  if (filter.branchType && branch.type !== filter.branchType) return false;
  if (filter.productCategory && product.category !== filter.productCategory) return false;
  return true;
}

function fillSelect(id, values, emptyLabel) {
  const select = byId(id);
  if (!select) return;
  select.replaceChildren(new Option(emptyLabel, ''));
  [...values].filter(value => value !== '' && value != null).sort((a, b) => String(a).localeCompare(String(b), 'id')).forEach(value => {
    select.add(new Option(value, value));
  });
}

function populateFilters() {
  fillSelect('f-tahun', new Set(transactions.map(row => row[0])), 'All years');
  fillSelect('f-provinsi', new Set(branches.map(branch => branch.province)), 'All provinces');
  fillSelect('f-cabang', new Set(branches.map(branch => branch.type)), 'All branch types');
  fillSelect('f-produk', new Set(products.map(product => product.category)), 'All categories');
}

/* ---------------------------------------------------------------------
   Aggregate filtered transactions in one pass. Each row represents
   one transaction; master tables are unique on their respective IDs.
   --------------------------------------------------------------------- */
function addToMap(map, key, initial) {
  let value = map.get(key);
  if (!value) {
    value = initial();
    map.set(key, value);
  }
  return value;
}

function buildModel() {
  const model = {
    count: 0, netSales: 0, grossSales: 0, discountAmount: 0,
    discountSum: 0, ratingSum: 0, ratingCount: 0,
    branchSet: new Set(), provinceSet: new Set(),
    monthly: new Map(), annual: new Map(),
    provinces: new Map(), branchTypes: new Map(), productCategories: new Map(),
    products: new Map(), branches: new Map(), ratings: new Map(), discounts: new Map(),
    branchRatings: new Map(), minMonth: Infinity, maxMonth: -Infinity
  };

  for (const row of transactions) {
    if (!transactionMatches(row)) continue;
    const [year, monthIndex, branchIndex, productIndex, price, discount, rating] = row;
    const branch = branches[branchIndex];
    const product = products[productIndex];
    const net = price * (1 - discount);

    model.count += 1;
    model.netSales += net;
    model.grossSales += price;
    model.discountAmount += price * discount;
    model.discountSum += discount;
    model.branchSet.add(branchIndex);
    model.provinceSet.add(branch.province);
    model.minMonth = Math.min(model.minMonth, monthIndex);
    model.maxMonth = Math.max(model.maxMonth, monthIndex);

    addToMap(model.monthly, monthIndex, () => ({ sales: 0, count: 0 })).sales += net;
    model.monthly.get(monthIndex).count += 1;
    addToMap(model.annual, year, () => ({ sales: 0, count: 0 })).sales += net;
    model.annual.get(year).count += 1;

    const province = addToMap(model.provinces, branch.province, () => ({ sales: 0, count: 0, ratingSum: 0, ratingCount: 0 }));
    province.sales += net;
    province.count += 1;
    const branchType = addToMap(model.branchTypes, branch.type, () => ({ sales: 0, count: 0 }));
    branchType.sales += net;
    branchType.count += 1;
    const category = addToMap(model.productCategories, product.category, () => ({ sales: 0, count: 0 }));
    category.sales += net;
    category.count += 1;

    const productAggregate = addToMap(model.products, productIndex, () => ({ sales: 0, count: 0 }));
    productAggregate.sales += net;
    productAggregate.count += 1;
    const branchAggregate = addToMap(model.branches, branchIndex, () => ({ sales: 0, count: 0, ratingSum: 0, ratingCount: 0 }));
    branchAggregate.sales += net;
    branchAggregate.count += 1;

    if (Number.isFinite(rating)) {
      const ratingKey = Math.round(rating * 10) / 10;
      model.ratingSum += rating;
      model.ratingCount += 1;
      province.ratingSum += rating;
      province.ratingCount += 1;
      branchAggregate.ratingSum += rating;
      branchAggregate.ratingCount += 1;
      model.ratings.set(ratingKey, (model.ratings.get(ratingKey) || 0) + 1);
    }

    const discountKey = Math.round(discount * 10000) / 100;
    const discountAggregate = addToMap(model.discounts, discountKey, () => ({ netSum: 0, count: 0 }));
    discountAggregate.netSum += net;
    discountAggregate.count += 1;
  }

  model.avgDiscount = model.count ? model.discountSum / model.count : 0;
  model.avgRating = model.ratingCount ? model.ratingSum / model.ratingCount : 0;
  model.averageTransactionValue = model.count ? model.netSales / model.count : 0;
  model.topProvinces = [...model.provinces.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.sales - a.sales);
  model.topProvinceTransactions = [...model.provinces.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.count - a.count);
  model.topBranchTypes = [...model.branchTypes.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.sales - a.sales);
  model.topProductCategories = [...model.productCategories.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.sales - a.sales);
  model.topProducts = [...model.products.entries()].map(([index, value]) => ({ ...products[index], ...value })).sort((a, b) => b.sales - a.sales).slice(0, 10);
  model.topBranches = [...model.branches.entries()].map(([index, value]) => ({ ...branches[index], ...value })).sort((a, b) => b.sales - a.sales).slice(0, 10);
  model.ratingByProvince = model.topProvinces.filter(item => item.ratingCount).map(item => ({ name: item.name, value: item.ratingSum / item.ratingCount, count: item.ratingCount })).sort((a, b) => b.value - a.value);
  model.branchRatingGaps = [...model.branches.entries()].map(([index, value]) => {
    const branch = branches[index];
    const transactionRating = value.ratingCount ? value.ratingSum / value.ratingCount : null;
    return {
      ...branch,
      transactions: value.count,
      transactionRating,
      gap: Number.isFinite(branch.rating) && transactionRating !== null ? branch.rating - transactionRating : null
    };
  }).filter(item => item.gap !== null && item.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 10);
  model.monthlyEntries = [...model.monthly.entries()].sort((a, b) => a[0] - b[0]);
  model.annualEntries = [...model.annual.entries()].sort((a, b) => a[0] - b[0]);
  model.ratingEntries = [...model.ratings.entries()].sort((a, b) => a[0] - b[0]);
  model.discountEntries = [...model.discounts.entries()].map(([discount, value]) => ({ discount, averageNet: value.netSum / value.count, count: value.count })).sort((a, b) => a.discount - b.discount);
  return model;
}

/* ---------------------------------------------------------------------
   Inventory summary under the currently selected non-date filters.
   Year is not applicable because inventory has no date column.
   --------------------------------------------------------------------- */
function getFilteredInventorySummary() {
  const summary = { records: 0, uniquePairs: 0, zeroRecords: 0, bins: new Uint32Array(7) };
  for (const group of inventoryGroups.values()) {
    if (filter.province && group.province !== filter.province) continue;
    if (filter.branchType && group.branchType !== filter.branchType) continue;
    if (filter.productCategory && group.productCategory !== filter.productCategory) continue;
    summary.records += group.records;
    summary.uniquePairs += group.uniquePairs;
    summary.zeroRecords += group.zeroRecords;
    for (let index = 0; index < summary.bins.length; index += 1) summary.bins[index] += group.bins[index];
  }
  summary.repeatedRecords = Math.max(0, summary.records - summary.uniquePairs);
  return summary;
}

/* ---------------------------------------------------------------------
   KPI and insight rendering
   --------------------------------------------------------------------- */
function renderKPIs(model) {
  setText('k-sales', formatRupiahShort(model.netSales));
  setText('k-sales-sub', `${formatRupiah(model.netSales)} setelah diskon`);
  setText('k-trx', formatNumber(model.count));
  setText('k-trx-sub', `${formatNumber(model.branchSet.size)} cabang dalam filter`);
  setText('k-atv', formatRupiahShort(model.averageTransactionValue));
  setText('k-discount', formatPercent(model.avgDiscount * 100, 2));
  setText('k-rating', formatRating(model.avgRating));
  setText('k-rating-sub', `Dari ${formatNumber(model.ratingCount)} rating transaksi`);
  setText('k-cabang', formatNumber(model.branchSet.size));
  setText('k-cabang-sub', `Dari ${formatNumber(branches.length)} cabang terdaftar`);
  setText('header-period', filter.year || 'Jan 2020 — Sep 2023');
  setText('data-context', `${formatNumber(model.count)} transaksi · ${formatNumber(model.branchSet.size)} cabang bertransaksi`);
}

function renderInsights(model) {
  const topProvince = model.topProvinces[0];
  const topCategory = model.topProductCategories[0];
  const topBranch = model.topBranches[0];

  setText('insight-province-value', topProvince?.name || 'Belum tersedia');
  setText('insight-province-copy', topProvince ? `${formatRupiahShort(topProvince.sales)} net sales · ${(topProvince.sales / (model.netSales || 1) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari total terfilter.` : 'Tidak ada transaksi pada filter ini.');
  setText('insight-category-value', topCategory?.name || 'Belum tersedia');
  setText('insight-category-copy', topCategory ? `${formatRupiahShort(topCategory.sales)} net sales dari ${formatNumber(topCategory.count)} transaksi.` : 'Tidak ada transaksi pada filter ini.');
  setText('insight-branch-value', topBranch ? `${topBranch.city} · ${topBranch.id}` : 'Belum tersedia');
  setText('insight-branch-copy', topBranch ? `${formatRupiahShort(topBranch.sales)} net sales dari ${formatNumber(topBranch.count)} transaksi.` : 'Tidak ada transaksi pada filter ini.');
}

/* ---------------------------------------------------------------------
   Chart helpers
   --------------------------------------------------------------------- */
function destroyChart(id) {
  const chart = chartInstances.get(id);
  if (chart) {
    chart.destroy();
    chartInstances.delete(id);
  }
}
function showChartEmpty(canvasId, emptyId, hasData) {
  const canvas = byId(canvasId);
  const empty = byId(emptyId);
  if (canvas) canvas.classList.toggle('hidden', !hasData);
  if (empty) empty.classList.toggle('hidden', hasData);
  if (!hasData) destroyChart(canvasId);
}
function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 280 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: COLORS.navy,
        titleColor: '#ffffff',
        bodyColor: '#e8f0ed',
        padding: 11,
        cornerRadius: 7,
        displayColors: false,
        titleFont: { family: 'IBM Plex Sans', weight: '600' },
        bodyFont: { family: 'IBM Plex Sans' }
      }
    }
  };
}
function chartScales(currency = false) {
  return {
    x: {
      grid: { color: COLORS.grid, drawBorder: false },
      border: { display: false },
      ticks: {
        color: COLORS.muted,
        font: { family: 'IBM Plex Sans', size: 10 },
        callback: value => currency ? formatRupiahShort(value) : formatNumber(value)
      }
    },
    y: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: COLORS.text, font: { family: 'IBM Plex Sans', size: 10 } }
    }
  };
}
function axisTitle(text) {
  return { display: true, text, color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 10 } };
}
const BAR_PALETTE = [
  '#087568', '#1a8a7c', '#2e9d8f', '#5aada2', '#83b5a8',
  '#a8c9bf', '#c5dcd6', '#6689a0', '#8a9eae', '#e78b46'
];
function barColors(count, highlightFirst = true) {
  if (highlightFirst) {
    return Array.from({ length: count }, (_, i) =>
      i === 0 ? COLORS.forest : BAR_PALETTE[1 + (i % (BAR_PALETTE.length - 1))]
    );
  }
  return Array.from({ length: count }, (_, i) => BAR_PALETTE[i % BAR_PALETTE.length]);
}
function barColorsReversed(count) {
  // for horizontal bars reversed, highlight the last item (top of chart = highest)
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? COLORS.forest : BAR_PALETTE[1 + ((count - 1 - i) % (BAR_PALETTE.length - 1))]
  );
}
function makeChart(canvasId, config) {
  const canvas = byId(canvasId);
  if (!canvas) return;
  destroyChart(canvasId);
  chartInstances.set(canvasId, new Chart(canvas.getContext('2d'), config));
}
function renderLineChart(canvasId, emptyId, model, subtitleId) {
  const entries = model.monthlyEntries;
  const hasData = entries.length > 0;
  showChartEmpty(canvasId, emptyId, hasData);
  if (!hasData) return;
  const labels = entries.map(([monthIndex]) => {
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12 + 1;
    return new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
  });
  const values = entries.map(([, value]) => value.sales);
  const peakIndex = values.indexOf(Math.max(...values));
  if (subtitleId) setText(subtitleId, `Puncak ${labels[peakIndex]} · ${formatRupiahShort(values[peakIndex])}`);
  const options = chartBaseOptions();
  options.plugins.tooltip.callbacks = {
    title: items => labels[items[0].dataIndex],
    label: context => `Net sales: ${formatRupiah(context.raw)}`
  };
  options.scales = {
    x: { grid: { display: false }, border: { display: false }, title: axisTitle('Periode (Bulan)'), ticks: { color: COLORS.muted, maxTicksLimit: 12, maxRotation: 0, font: { family: 'IBM Plex Sans', size: 10 } } },
    y: { beginAtZero: true, grid: { color: COLORS.grid }, border: { display: false }, title: axisTitle('Net Sales (Rp)'), ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 10 }, callback: value => formatRupiahShort(value) } }
  };
  makeChart(canvasId, {
    type: 'line',
    data: { labels, datasets: [{
      label: 'Net sales', data: values, borderColor: COLORS.forest, backgroundColor: 'rgba(8,117,104,0.08)',
      borderWidth: 2.2, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.22
    }] },
    options
  });
}
function renderAnnualChart(canvasId, emptyId, model) {
  const entries = model.annualEntries;
  showChartEmpty(canvasId, emptyId, entries.length > 0);
  if (!entries.length) return;
  const best = entries.reduce((current, item) => item[1].sales > current[1].sales ? item : current, entries[0]);
  const options = chartBaseOptions();
  options.plugins.tooltip.callbacks = { label: context => `Net sales: ${formatRupiah(context.raw)}` };
  options.scales = {
    x: { grid: { display: false }, border: { display: false }, title: axisTitle('Tahun'), ticks: { color: COLORS.text, font: { family: 'IBM Plex Sans', size: 11 } } },
    y: { beginAtZero: true, grid: { color: COLORS.grid }, border: { display: false }, title: axisTitle('Net Sales (Rp)'), ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, callback: value => formatRupiahShort(value) } }
  };
  const annualColors = entries.map(([year]) => year === best[0] ? COLORS.forest : COLORS.orange);
  makeChart(canvasId, {
    type: 'bar',
    data: { labels: entries.map(([year]) => String(year)), datasets: [{ label: 'Net sales', data: entries.map(([, value]) => value.sales), backgroundColor: annualColors, borderRadius: 3, maxBarThickness: 42 }] },
    options
  });
  const noteId = canvasId === 'chart-annual' ? 'sub-annual' : null;
  if (noteId) setText(noteId, `Tertinggi ${best[0]} · ${formatRupiahShort(best[1].sales)}`);
}
function renderDoughnutChart(canvasId, emptyId, entries, valueKey, formatValue, options = {}) {
  const items = (entries || []).filter(item => Number(item[valueKey]) > 0).sort((a, b) => b[valueKey] - a[valueKey]);
  showChartEmpty(canvasId, emptyId, items.length > 0);
  if (!items.length) return;

  const palette = options.palette || [
    COLORS.forest, '#5f978b', '#86b0a4', '#b4cec4',
    COLORS.navy, '#7892a2', COLORS.orange, '#d6b48f'
  ];
  const total = items.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0);
  const chartOptions = chartBaseOptions();
  chartOptions.cutout = '68%';
  chartOptions.plugins.legend = {
    display: true,
    position: 'bottom',
    labels: {
      color: COLORS.text,
      usePointStyle: true,
      pointStyle: 'circle',
      boxWidth: 8,
      boxHeight: 8,
      padding: 13,
      font: { family: 'IBM Plex Sans', size: 10 }
    }
  };
  chartOptions.plugins.tooltip.callbacks = {
    label: context => {
      const item = items[context.dataIndex];
      const share = total ? item[valueKey] / total * 100 : 0;
      return `${item.name}: ${formatValue(context.raw)} · ${formatPercent(share, 1)}`;
    }
  };
  chartOptions.layout = { padding: { top: 4, bottom: 4 } };

  makeChart(canvasId, {
    type: 'doughnut',
    data: {
      labels: items.map(item => item.name),
      datasets: [{
        data: items.map(item => item[valueKey]),
        backgroundColor: items.map((_, index) => palette[index % palette.length]),
        borderColor: COLORS.white,
        borderWidth: 3,
        hoverOffset: 4,
        spacing: 1
      }]
    },
    options: chartOptions
  });
}

function renderVerticalBars(canvasId, emptyId, entries, valueKey, formatValue, options = {}) {
  const items = (entries || []).slice(0, options.limit || 12);
  showChartEmpty(canvasId, emptyId, items.length > 0);
  if (!items.length) return;

  const chartOptions = chartBaseOptions();
  chartOptions.plugins.tooltip.callbacks = {
    label: context => options.tooltip ? options.tooltip(context.raw, items[context.dataIndex]) : formatValue(context.raw)
  };
  chartOptions.scales = {
    x: {
      grid: { display: false },
      border: { display: false },
      title: options.xLabel ? axisTitle(options.xLabel) : undefined,
      ticks: { color: COLORS.text, font: { family: 'IBM Plex Sans', size: 10 }, maxRotation: 0, minRotation: 0 }
    },
    y: {
      beginAtZero: true,
      grid: { color: COLORS.grid },
      border: { display: false },
      title: options.yLabel ? axisTitle(options.yLabel) : undefined,
      ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, callback: value => formatValue(value) }
    }
  };

  makeChart(canvasId, {
    type: 'bar',
    data: {
      labels: items.map(item => options.label ? options.label(item) : item.name),
      datasets: [{
        label: options.datasetLabel || 'Transactions',
        data: items.map(item => item[valueKey]),
        backgroundColor: barColors(items.length),
        borderRadius: 3,
        maxBarThickness: 40,
        categoryPercentage: 0.72
      }]
    },
    options: chartOptions
  });
}

function renderProvinceFootprintChart(model) {
  // Top 10 provinces by transaction count, reversed for horizontal bar display (top = highest)
  const items = (model.topProvinceTransactions || []).slice(0, 10).reverse();
  showChartEmpty('chart-prov-trx', 'empty-prov-trx', items.length > 0);
  if (!items.length) return;

  const labels = items.map(item => item.name);
  const salesData = items.map(item => item.sales);
  const countData = items.map(item => item.count);
  const maxSales = Math.max(...salesData);
  const maxCount = Math.max(...countData);

  const options = chartBaseOptions();
  options.indexAxis = 'y';
  options.interaction = { mode: 'index', intersect: false };
  options.plugins.legend = {
    display: true,
    position: 'top',
    labels: {
      color: COLORS.text,
      usePointStyle: true,
      pointStyle: 'circle',
      boxWidth: 8,
      boxHeight: 8,
      padding: 14,
      font: { family: 'IBM Plex Sans', size: 10 }
    }
  };
  options.plugins.tooltip.callbacks = {
    label: context => {
      const item = items[context.dataIndex];
      if (context.datasetIndex === 0) return `Net sales: ${formatRupiah(item.sales)}`;
      return `Transaksi: ${formatNumber(item.count)} · Rata-rata: ${formatRupiah(item.count ? item.sales / item.count : 0)}`;
    }
  };
  options.scales = {
    x: {
      beginAtZero: true,
      grid: { color: COLORS.grid },
      border: { display: false },
      title: axisTitle('Net Sales (Rp)'),
      ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, callback: value => formatRupiahShort(value) },
      max: maxSales * 1.08
    },
    xCount: {
      beginAtZero: true,
      position: 'top',
      grid: { display: false },
      border: { display: false },
      title: axisTitle('Jumlah Transaksi'),
      ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, callback: value => formatNumber(value) },
      max: maxCount * 1.08
    },
    y: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: COLORS.text, font: { family: 'IBM Plex Sans', size: 10 } }
    }
  };

  makeChart('chart-prov-trx', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Net Sales',
          data: salesData,
          backgroundColor: 'rgba(8,117,104,0.75)',
          borderColor: COLORS.forest,
          borderWidth: 0,
          borderRadius: 2,
          xAxisID: 'x',
          barPercentage: 0.55,
          categoryPercentage: 0.80
        },
        {
          label: 'Jumlah Transaksi',
          data: countData,
          backgroundColor: 'rgba(231,139,70,0.65)',
          borderColor: COLORS.orange,
          borderWidth: 0,
          borderRadius: 2,
          xAxisID: 'xCount',
          barPercentage: 0.55,
          categoryPercentage: 0.80
        }
      ]
    },
    options
  });
}

function renderHorizontalBars(canvasId, emptyId, entries, valueKey, formatValue, options = {}) {
  const items = (entries || []).slice(0, options.limit || 10).reverse();
  showChartEmpty(canvasId, emptyId, items.length > 0);
  if (!items.length) return;
  const chartOptions = chartBaseOptions();
  chartOptions.indexAxis = 'y';
  chartOptions.plugins.tooltip.callbacks = {
    label: context => options.tooltip ? options.tooltip(context.raw, items[context.dataIndex]) : formatValue(context.raw)
  };
  chartOptions.scales = {
    x: { beginAtZero: true, grid: { color: COLORS.grid }, border: { display: false }, title: options.xLabel ? axisTitle(options.xLabel) : undefined, ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, callback: value => formatValue(value) } },
    y: { grid: { display: false }, border: { display: false }, title: options.yLabel ? axisTitle(options.yLabel) : undefined, ticks: { color: COLORS.text, font: { family: 'IBM Plex Sans', size: 10 } } }
  };
  chartOptions.layout = { padding: { right: 8 } };
  makeChart(canvasId, {
    type: 'bar',
    data: {
      labels: items.map(item => options.label ? options.label(item) : item.name),
      datasets: [{
        label: options.datasetLabel || 'Value',
        data: items.map(item => item[valueKey]),
        backgroundColor: barColorsReversed(items.length),
        borderRadius: 2,
        barPercentage: options.barPercentage || 0.72,
        categoryPercentage: 0.78
      }]
    },
    options: chartOptions
  });
}
function renderRatingChart(canvasId, emptyId, model) {
  const entries = model.ratingEntries;
  showChartEmpty(canvasId, emptyId, entries.length > 0);
  if (!entries.length) return;
  const labels = entries.map(([rating]) => Number(rating).toFixed(1));
  const values = entries.map(([, count]) => count);
  const options = chartBaseOptions();
  options.plugins.tooltip.callbacks = {
    title: items => `Rating ${labels[items[0].dataIndex]}`,
    label: context => `${formatNumber(context.raw)} transaksi (${formatPercent(context.raw / model.ratingCount * 100, 1)})`
  };
  options.scales = {
    x: { grid: { display: false }, border: { display: false }, title: axisTitle('Nilai Rating'), ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, maxRotation: 0 } },
    y: { beginAtZero: true, grid: { color: COLORS.grid }, border: { display: false }, title: axisTitle('Jumlah Transaksi'), ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, callback: value => formatNumber(value) } }
  };
  makeChart(canvasId, { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: barColors(values.length, false), borderRadius: 2, maxBarThickness: 22 }] }, options });
  setText('sub-rating-dist', `Rata-rata ${formatRating(model.avgRating)} · ${formatNumber(model.ratingCount)} rating`);
}
function renderDiscountChart(model) {
  const entries = model.discountEntries;
  showChartEmpty('chart-discount', 'empty-discount', entries.length > 1);
  if (entries.length <= 1) return;
  const points = entries.map(item => ({ x: item.discount, y: item.averageNet, count: item.count }));
  const options = chartBaseOptions();
  options.plugins.tooltip.callbacks = {
    label: context => `Diskon ${context.raw.x}% · Avg. net sales ${formatRupiah(context.raw.y)} · ${formatNumber(context.raw.count)} transaksi`
  };
  options.scales = {
    x: { title: { display: true, text: 'Discount (%)', color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 10 } }, grid: { color: COLORS.grid }, border: { display: false }, ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, callback: value => `${value}%` } },
    y: { title: { display: true, text: 'Average net sales', color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 10 } }, grid: { color: COLORS.grid }, border: { display: false }, ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, callback: value => formatRupiahShort(value) } }
  };
  makeChart('chart-discount', {
    type: 'scatter',
    data: { datasets: [{ label: 'Average net sales', data: points, backgroundColor: 'rgba(8,117,104,0.68)', borderColor: COLORS.forest, pointRadius: 5, pointHoverRadius: 7 }] },
    options
  });
}
function renderProvinceRating(model) {
  const entries = model.ratingByProvince.slice(0, 10).reverse();
  showChartEmpty('chart-province-rating', 'empty-province-rating', entries.length > 0);
  if (!entries.length) return;
  const options = chartBaseOptions();
  options.indexAxis = 'y';
  options.plugins.tooltip.callbacks = { label: context => `Rata-rata ${formatRating(context.raw)} dari ${formatNumber(entries[context.dataIndex].count)} transaksi` };
  options.scales = {
    x: { min: 0, max: 5, grid: { color: COLORS.grid }, border: { display: false }, title: axisTitle('Rata-rata Rating (0–5)'), ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 } } },
    y: { grid: { display: false }, border: { display: false }, title: axisTitle('Provinsi'), ticks: { color: COLORS.text, font: { family: 'IBM Plex Sans', size: 10 } } }
  };
  makeChart('chart-province-rating', { type: 'bar', data: { labels: entries.map(item => item.name), datasets: [{ data: entries.map(item => item.value), backgroundColor: barColorsReversed(entries.length), borderRadius: 2, barPercentage: 0.72 }] }, options });
}
function renderInventoryChart(summary) {
  const labels = ['0', '1–10', '11–25', '26–50', '51–75', '76–100', '>100'];
  const hasData = summary.records > 0;
  showChartEmpty('chart-inventory', 'empty-inventory', hasData);
  setText('inv-records', formatNumber(summary.records));
  setText('inv-pairs', formatNumber(summary.uniquePairs));
  setText('inv-repeated', formatNumber(summary.repeatedRecords));
  setText('inv-zero', formatNumber(summary.zeroRecords));
  setText('inv-chart-meta', `${formatNumber(summary.records)} catatan`);
  setText('inventory-filter-note', filter.year
    ? `Filter tahun ${filter.year} tidak diterapkan pada inventaris karena dataset tidak memiliki kolom tanggal. Filter wilayah, tipe cabang, dan kategori produk tetap diterapkan.`
    : 'Filter tahun tidak diterapkan pada inventaris karena dataset tidak memiliki kolom tanggal. Filter provinsi, tipe cabang, dan kategori produk diterapkan melalui tabel referensi.');
  if (!hasData) return;
  const options = chartBaseOptions();
  options.plugins.tooltip.callbacks = { label: context => `${formatNumber(context.raw)} catatan (${formatPercent(context.raw / summary.records * 100, 1)})` };
  options.scales = {
    x: { grid: { display: false }, border: { display: false }, title: axisTitle('Rentang Stok (unit)'), ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 10 } } },
    y: { beginAtZero: true, grid: { color: COLORS.grid }, border: { display: false }, title: axisTitle('Jumlah Catatan'), ticks: { color: COLORS.muted, font: { family: 'IBM Plex Sans', size: 9 }, callback: value => formatNumber(value) } }
  };
  makeChart('chart-inventory', { type: 'bar', data: { labels, datasets: [{ data: [...summary.bins], backgroundColor: ['#d69b72', '#9dbeb5', '#9dbeb5', '#83b5a8', '#6a9d90', '#4d887c', '#376f65'], borderRadius: 2, maxBarThickness: 64 }] }, options });
}

/* ---------------------------------------------------------------------
   Page renderers
   --------------------------------------------------------------------- */
function renderOverview(model) {
  renderLineChart('chart-trend', 'empty-trend', model, 'sub-trend');
  const leadingProvince = model.topProvinces[0];
  setText('sub-prov-sales', leadingProvince ? `${leadingProvince.name} · ${formatRupiahShort(leadingProvince.sales)}` : '—');
  renderAnnualChart('chart-annual', 'empty-annual', model);
  renderHorizontalBars('chart-prov-sales', 'empty-prov-sales', model.topProvinces, 'sales', formatRupiahShort, {
    tooltip: value => `Net sales: ${formatRupiah(value)}`,
    xLabel: 'Net Sales (Rp)', yLabel: 'Provinsi'
  });
  renderDoughnutChart('chart-prod-cat', 'empty-prod-cat', model.topProductCategories, 'sales', formatRupiahShort);
  renderInsights(model);
}
function renderSalesPage(model) {
  renderLineChart('chart-trend-sales', 'empty-trend-sales', model, 'sub-trend-sales');
  renderAnnualChart('chart-annual-sales', 'empty-annual-sales', model);
  renderDiscountChart(model);
}
function renderRegionalPage(model) {
  const leadingProvince = model.topProvinces[0];
  const leadingBranch = model.topBranches[0];
  setText('sub-prov-sales-reg', leadingProvince ? `${leadingProvince.name} · ${formatRupiahShort(leadingProvince.sales)}` : '—');
  setText('sub-top-branch', leadingBranch ? `${leadingBranch.city} · ${formatRupiahShort(leadingBranch.sales)}` : '—');
  renderHorizontalBars('chart-prov-sales-reg', 'empty-prov-sales-reg', model.topProvinces, 'sales', formatRupiahShort, {
    tooltip: value => `Net sales: ${formatRupiah(value)}`,
    xLabel: 'Net Sales (Rp)', yLabel: 'Provinsi'
  });
  renderProvinceFootprintChart(model);
  renderHorizontalBars('chart-top-branch', 'empty-top-branch', model.topBranches, 'sales', formatRupiahShort, {
    label: item => `${item.city} · ${item.id}`,
    tooltip: (value, item) => `${item.name} · ${formatRupiah(value)}`,
    xLabel: 'Net Sales (Rp)', yLabel: 'Cabang'
  });
  renderDoughnutChart('chart-branch-cat', 'empty-branch-cat', model.topBranchTypes, 'sales', formatRupiahShort, {
    palette: [COLORS.forest, '#8fb8aa', COLORS.orange]
  });
  renderRatingGapTable(model);
}
function renderRatingGapTable(model) {
  const tbody = byId('rating-gap-tbody');
  if (!tbody) return;
  const rows = model.branchRatingGaps;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty-cell">Tidak ada cabang dengan rating cabang lebih tinggi daripada rata-rata rating transaksinya pada filter ini.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((branch, index) => `
    <tr>
      <td class="row-index">${index + 1}</td>
      <td class="mono-cell">${escapeHTML(branch.id)}</td>
      <td class="branch-name-cell" title="${escapeHTML(branch.name)}">${escapeHTML(branch.name)}</td>
      <td>${escapeHTML(branch.city)}</td>
      <td>${escapeHTML(branch.province)}</td>
      <td class="numeric">${formatRating(branch.rating)}</td>
      <td class="numeric">${formatRating(branch.transactionRating)}</td>
      <td class="numeric gap-value">${branch.gap >= 0 ? '+' : ''}${formatRating(branch.gap)}</td>
    </tr>`).join('');
}
function renderProductPage(model) {
  renderHorizontalBars('chart-prod-cat-page', 'empty-prod-cat-page', model.topProductCategories, 'sales', formatRupiahShort, {
    tooltip: value => `Net sales: ${formatRupiah(value)}`,
    xLabel: 'Net Sales (Rp)', yLabel: 'Kategori Produk'
  });
  renderVerticalBars('chart-prod-count', 'empty-prod-count', [...model.productCategories.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.count - a.count), 'count', formatNumber, {
    tooltip: value => `${formatNumber(value)} transaksi`,
    datasetLabel: 'Transaction count',
    xLabel: 'Kategori Produk', yLabel: 'Jumlah Transaksi'
  });
  renderHorizontalBars('chart-top-products', 'empty-top-products', model.topProducts, 'sales', formatRupiahShort, {
    label: item => item.name.length > 44 ? `${item.name.slice(0, 42)}…` : item.name,
    tooltip: (value, item) => `${item.name} · ${formatRupiah(value)} · ${formatNumber(item.count)} transaksi`,
    barPercentage: 0.66,
    xLabel: 'Net Sales (Rp)', yLabel: 'Nama Produk'
  });
}
function renderCustomerPage(model) {
  renderRatingChart('chart-rating-dist', 'empty-rating-dist', model);
  renderProvinceRating(model);
}
function renderCurrentPage() {
  if (!currentModel) return;
  if (currentPage === 'overview') renderOverview(currentModel);
  if (currentPage === 'sales') renderSalesPage(currentModel);
  if (currentPage === 'regional') renderRegionalPage(currentModel);
  if (currentPage === 'product') renderProductPage(currentModel);
  if (currentPage === 'customer') renderCustomerPage(currentModel);
  if (currentPage === 'inventory') renderInventoryChart(getFilteredInventorySummary());
}

/* ---------------------------------------------------------------------
   Navigation and filter events
   --------------------------------------------------------------------- */
function switchPage(page) {
  if (!PAGE_META[page]) return;
  currentPage = page;
  document.querySelectorAll('[data-view]').forEach(view => view.classList.toggle('is-active', view.dataset.view === page));
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('is-active', button.dataset.page === page));
  const meta = PAGE_META[page];
  setText('topbar-title', meta.title);
  setText('page-eyebrow', meta.eyebrow);
  setText('page-heading', meta.heading);
  setText('page-description', meta.description);
  requestAnimationFrame(renderCurrentPage);
}

function updateActiveFilterTags() {
  const container = byId('active-filter-tags');
  if (!container) return;
  const labels = {
    year: 'Year', province: 'Province', branchType: 'Branch type', productCategory: 'Product category'
  };
  const tags = Object.entries(filter).filter(([, value]) => value);
  container.replaceChildren();
  tags.forEach(([key, value]) => {
    const tag = document.createElement('span');
    tag.className = 'filter-tag';
    tag.textContent = `${labels[key]}: ${value}`;
    container.appendChild(tag);
  });
}

function refreshFilteredView() {
  currentModel = buildModel();
  renderKPIs(currentModel);
  updateActiveFilterTags();
  renderCurrentPage();
}

function wireEvents() {
  const filterBindings = [
    ['f-tahun', 'year'], ['f-provinsi', 'province'], ['f-cabang', 'branchType'], ['f-produk', 'productCategory']
  ];
  filterBindings.forEach(([elementId, key]) => {
    byId(elementId)?.addEventListener('change', event => {
      filter[key] = event.target.value;
      refreshFilteredView();
    });
  });

  byId('btn-reset')?.addEventListener('click', () => {
    Object.keys(filter).forEach(key => { filter[key] = ''; });
    filterBindings.forEach(([elementId]) => { if (byId(elementId)) byId(elementId).value = ''; });
    refreshFilteredView();
  });

  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => switchPage(button.dataset.page));
  });
  document.querySelector('[data-page-link]')?.addEventListener('click', event => {
    event.preventDefault();
    switchPage('overview');
  });
  byId('btn-export')?.addEventListener('click', exportSummaryCSV);
}

/* ---------------------------------------------------------------------
   Export filtered executive summary — excludes unsupported profit data.
   --------------------------------------------------------------------- */
function exportSummaryCSV() {
  const model = currentModel || buildModel();
  const filterDescription = Object.entries(filter).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join('; ') || 'Semua data';
  const rows = [
    ['Kimia Farma — Business Performance Summary'],
    ['Exported at', new Date().toLocaleString('id-ID')],
    ['Active filters', filterDescription],
    [],
    ['Metric', 'Value'],
    ['Net sales after discount (IDR)', Math.round(model.netSales)],
    ['Transactions', model.count],
    ['Average transaction value (IDR)', Math.round(model.averageTransactionValue)],
    ['Average discount (%)', (model.avgDiscount * 100).toFixed(4)],
    ['Average transaction rating', model.avgRating.toFixed(4)],
    ['Branches with transactions', model.branchSet.size],
    ['Provinces with transactions', model.provinceSet.size],
    [],
    ['Note', 'Profit is not calculated because cost of goods sold is not available in the supplied datasets.']
  ];
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'kimia-farma-business-performance-summary.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------
   Bootstrap
   --------------------------------------------------------------------- */
(async function initializeDashboard() {
  try {
    if (typeof Papa === 'undefined' || typeof Chart === 'undefined') {
      throw new Error('Library PapaParse atau Chart.js tidak berhasil dimuat. Periksa koneksi internet dan CDN.');
    }

    setLoading('Locating source files', 'Memeriksa folder data/raw/', 2);
    dataBase = await detectDataDirectory();
    await loadDimensions();
    await loadInventory();
    await loadTransactions();

    setLoading('Building analytics', 'Menghitung KPI dan agregasi awal', 94);
    populateFilters();
    wireEvents();
    currentModel = buildModel();
    renderKPIs(currentModel);
    updateActiveFilterTags();

    setLoading('Dashboard ready', `${formatNumber(transactions.length)} transaksi · ${formatNumber(inventoryRecordCount)} catatan inventaris`, 100);
    revealApp();
    requestAnimationFrame(() => renderCurrentPage());
  } catch (error) {
    console.error('Dashboard initialization failed:', error);
    showError(error.message || String(error));
  }
})();
