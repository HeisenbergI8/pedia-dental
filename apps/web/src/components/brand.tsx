import { useId } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * The Primolar mark: a P whose counter is a molar, with a smile on its crown. The bowl curls back
 * without closing, so the tooth's root runs out between the stem and the curl. Drawn once here, in
 * the artwork's own units; icon.svg, the app icons and primolar-logo.png (the PDF) are cut from it.
 */
const MARK_P =
  "M123 143H300A161 161 0 0 1 300 465H276A39 39 0 0 1 276 387C330 387 379 350 379 300C379 262 360 239 335 239" +
  "C304 239 286 247 274 256Q268 261 262 256C250 247 236 239 218 239C196 239 180 252 176 272" +
  "C173 290 181 320 181 350V510A20 20 0 0 1 161 530H115A20 20 0 0 1 95 510V171A28 28 0 0 1 123 143Z";
const MARK_SMILE = "M240 330Q288 384 336 330";

/** The mark's paths, coloured from the logo tokens so it follows the theme. The P is a soft diagonal gradient. */
function MarkPaths({ animated }: { animated?: boolean }) {
  const gradient = useId();
  return (
    <>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-logo-hi)" />
          <stop offset="1" stopColor="var(--color-logo-lo)" />
        </linearGradient>
      </defs>
      <path d={MARK_P} fill={`url(#${gradient})`} />
      <path
        d={MARK_SMILE}
        pathLength={1}
        className={animated ? "pm-smile" : undefined}
        fill="none"
        stroke="var(--color-logo-smile)"
        strokeWidth={28}
        strokeLinecap="round"
      />
    </>
  );
}

/** The mark on its own: the tablet rail, loaders. Decorative; the caller names it. */
export function PrimolarMark({ className, animated }: { className?: string; animated?: boolean }) {
  return (
    <svg aria-hidden viewBox="71 128 418 418" className={cn("size-11", animated && "pm-bob", className)}>
      <MarkPaths animated={animated} />
    </svg>
  );
}

/*
 * The name's "o" is a molar, traced from the approved Primolar artwork (its outer edge and its hole, filled
 * even-odd) and scaled by the artwork's x-height to Outfit's. It keeps the artwork's gaps to the "m" and "l", so
 * "lar" starts after it. Placed against Outfit at 336 and weight 560; the offsets only hold for that.
 */
const NAME_MOLAR =
  "M1381.1 313.6C1377.8 314.1 1374.6 315 1371.5 316C1368.4 317 1365.3 318.2 1362.5 319.6" +
  "C1359.8 321 1357.2 322.5 1354.8 324.3C1352.4 326.2 1350.5 328.1 1348.4 330.5" +
  "C1346.3 332.9 1343.9 336.2 1342.2 338.9C1340.6 341.5 1339.6 343.6 1338.4 346.6" +
  "C1337.2 349.6 1336 353.4 1335.1 356.9C1334.3 360.4 1333.7 364.7 1333.3 367.7" +
  "C1333 370.8 1332.9 372.7 1332.8 375.2C1332.8 377.7 1332.9 379.6 1333.2 382.9" +
  "C1333.5 386.2 1334.1 390.7 1334.8 394.9C1335.5 399.1 1335.1 399 1337.5 408" +
  "C1339.8 416.9 1345.2 436.4 1349.1 448.6C1353 460.7 1357.8 473.2 1360.9 480.6" +
  "C1363.9 488 1365.7 490.2 1367.3 493C1368.9 495.8 1369.2 495.9 1370.4 497.2" +
  "C1371.5 498.5 1372.7 499.8 1374 500.9C1375.4 502 1376.8 502.9 1378.4 503.8" +
  "C1379.9 504.7 1381.8 505.5 1383.5 506.1C1385.2 506.6 1386.8 507 1388.5 507.2" +
  "C1390.2 507.5 1391.6 507.7 1393.7 507.6C1395.8 507.4 1398.6 507.2 1401.1 506.4" +
  "C1403.6 505.5 1407 503.7 1408.8 502.6C1410.7 501.5 1411.1 500.9 1412.2 499.8" +
  "C1413.3 498.7 1414.2 498.2 1415.6 495.9C1417.1 493.5 1419.6 487.7 1420.9 485.5" +
  "C1422.1 483.2 1422.4 483.2 1423.1 482.4C1423.9 481.6 1424.7 481.1 1425.5 480.7" +
  "C1426.4 480.2 1427.1 479.7 1428.5 479.5C1429.9 479.4 1432.6 479.4 1434 479.6" +
  "C1435.3 479.8 1435.9 480.2 1436.8 480.8C1437.8 481.4 1438.2 480.9 1439.7 483.2" +
  "C1441.2 485.6 1443.9 492 1445.7 495C1447.5 497.9 1448.6 499 1450.4 500.7C1452.2 502.4 1454.4 504 1456.5 505" +
  "C1458.5 506.1 1460.7 506.7 1462.8 507.2C1464.8 507.7 1466.8 507.9 1468.9 507.9" +
  "C1470.9 507.8 1472.8 507.6 1474.8 507.1C1476.9 506.6 1479.2 505.9 1481.2 505" +
  "C1483.2 504 1485.4 502.6 1487 501.4C1488.6 500.3 1489.5 499.4 1490.8 498C1492.2 496.5 1493.4 495.2 1495 492.7" +
  "C1496.6 490.3 1498.9 485.8 1500.2 483.3C1501.5 480.8 1501 481.9 1502.7 477.5" +
  "C1504.4 473.1 1507.2 466 1510.4 457C1513.6 448 1518.9 432.2 1521.7 423.4" +
  "C1524.5 414.5 1525.8 409.6 1527.2 403.8C1528.6 398.1 1529.5 393.5 1530.2 389.1" +
  "C1530.9 384.6 1531.1 381 1531.2 377.3C1531.3 373.6 1531.3 370.5 1530.9 366.9" +
  "C1530.5 363.2 1529.8 359 1528.9 355.4C1528 351.8 1526.6 347.9 1525.6 345.3" +
  "C1524.6 342.7 1523.7 341.3 1522.8 339.6C1521.8 337.9 1521.1 336.9 1519.8 335.2" +
  "C1518.5 333.5 1516.6 331.3 1515 329.6C1513.4 328 1511.7 326.5 1510.1 325.1" +
  "C1508.5 323.8 1507.1 322.8 1505.2 321.7C1503.4 320.5 1502.1 319.5 1499.2 318.3" +
  "C1496.2 317.1 1491.1 315.4 1487.3 314.4C1483.5 313.5 1479.9 313 1476.2 312.8" +
  "C1472.4 312.6 1469 312.7 1464.7 313.2C1460.5 313.7 1455.6 314.5 1450.6 315.7" +
  "C1445.6 316.9 1437.8 319.7 1434.6 320.6C1431.4 321.4 1432.4 321.1 1431.2 321.1" +
  "C1430.1 321.1 1431 321.5 1427.8 320.6C1424.6 319.8 1416.1 317 1411.8 315.9" +
  "C1407.6 314.8 1405.5 314.4 1402.1 313.9C1398.8 313.4 1395.1 313 1391.6 312.9" +
  "C1388.1 312.9 1384.5 313.1 1381.1 313.6ZM1465.6 341.7C1462 342.2 1457.1 342.9 1452.1 344.3" +
  "C1447 345.8 1438.9 349.5 1435.5 350.7C1432 351.9 1432.7 351.3 1431.3 351.3" +
  "C1429.8 351.3 1429.8 351.6 1427 350.7C1424.2 349.8 1418.6 347.3 1414.5 346" +
  "C1410.4 344.7 1405.9 343.7 1402.4 343C1398.9 342.4 1396.5 342.1 1393.7 342" +
  "C1390.9 341.9 1388 342.1 1385.5 342.5C1383 342.9 1380.9 343.5 1378.9 344.3C1376.9 345 1375 345.9 1373.3 347" +
  "C1371.7 348.1 1370.2 349.3 1368.8 350.9C1367.5 352.4 1366.2 354.5 1365.1 356.5" +
  "C1364.1 358.6 1363.3 360.8 1362.6 363.4C1361.9 366 1361.3 369.2 1361.1 372.2" +
  "C1360.8 375.2 1360.9 378.2 1361.1 381.4C1361.3 384.6 1361.7 387.9 1362.3 391.5" +
  "C1362.9 395 1363.4 397.9 1364.5 402.8C1365.6 407.8 1366.4 412.1 1369.1 421.2" +
  "C1371.7 430.4 1377.4 449.1 1380.4 458C1383.3 466.9 1385.2 471.4 1386.6 474.7" +
  "C1387.9 478 1387.7 477.1 1388.6 478C1389.4 478.9 1390.4 479.8 1391.4 480.3" +
  "C1392.4 480.8 1393.5 480.9 1394.6 480.8C1395.6 480.8 1396.7 480.4 1397.6 479.9" +
  "C1398.4 479.3 1398.4 479.4 1399.5 477.6C1400.5 475.9 1402.2 472 1403.9 469.5" +
  "C1405.6 467.1 1407.6 464.8 1409.8 462.9C1412.1 461 1414.7 459.3 1417.5 458" +
  "C1420.2 456.8 1423.4 455.9 1426.4 455.5C1429.3 455.1 1432.2 455.1 1435.2 455.5" +
  "C1438.2 455.9 1441.5 456.7 1444.2 457.8C1447 458.9 1449.4 460.3 1451.6 462" +
  "C1453.8 463.6 1455.4 464.9 1457.4 467.7C1459.3 470.4 1462.1 476.2 1463.4 478.3" +
  "C1464.8 480.4 1464.7 479.8 1465.6 480.2C1466.5 480.6 1467.9 480.9 1468.8 480.9" +
  "C1469.7 480.9 1470.4 480.8 1471.2 480.4C1472 480 1472.9 479.2 1473.5 478.5" +
  "C1474.2 477.8 1472.9 482 1475.1 475.9C1477.4 469.8 1483.1 454.2 1487 441.9" +
  "C1491 429.7 1496.1 411.9 1498.7 402.5C1501.2 393 1501.6 390.4 1502.3 385.2C1503 380 1503 374.5 1502.9 371" +
  "C1502.9 367.6 1502.5 366.7 1502 364.5C1501.4 362.2 1500.6 359.6 1499.7 357.5" +
  "C1498.7 355.3 1497.5 353.1 1496.3 351.4C1495.1 349.7 1493.6 348.4 1492.2 347.2" +
  "C1490.7 346 1489.4 345.3 1487.6 344.5C1485.8 343.7 1483.6 342.9 1481.3 342.4" +
  "C1479 341.8 1476.7 341.5 1474.1 341.4C1471.5 341.2 1469.3 341.2 1465.6 341.7Z";
  "C1432.2 301.4 1453 309.7 1466.8 330.4Z";

/** "Primolar" with the molar "o", in the logo's units (baseline 488). */
function NamePaths() {
  const text = { y: 488, fontSize: 336, fontWeight: 560, fill: "var(--color-logo-ink)", style: { fontFamily: "var(--font-brand)" } };
  return (
    <>
      <text x="611" {...text}>Prim</text>
      <path d={NAME_MOLAR} fill="var(--color-logo-ink)" fillRule="evenodd" />
      <text x="1535.7" {...text}>lar</text>
    </>
  );
}

/**
 * The full logo: the mark and "Primolar" in Outfit (--font-brand), laid out as the approved artwork.
 * Use it wherever the clinic introduces itself. One SVG, so `className` widths scale it whole.
 */
export function PrimolarLogo({ className }: { className?: string }) {
  return (
    <svg role="img" aria-label="Primolar" viewBox="56 126 1900 468" className={cn("h-auto w-40", className)}>
      <g transform="translate(-58.48 -46.32) scale(1.205)">
        <MarkPaths />
      </g>
      <NamePaths />
    </svg>
  );
}

/** The name alone, for the loading screen. Decorative; the screen's status names it. */
export function PrimolarName({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="630 240 1326 290" className={cn("h-auto w-48", className)}>
      <NamePaths />
    </svg>
  );
}

/**
 * Content inside an open page that is still loading: a skeleton shaped like a list, so the layout
 * doesn't jump when the rows arrive. Fades in after a beat so fast loads don't flash. `compact` is one
 * line, for tight spots like the patient header or a side card. The label is for screen readers.
 */
export function Loading({ label = "Loading", compact, rows = 3, className }: { label?: string; compact?: boolean; rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("pm-fade-in", compact ? "py-3" : "space-y-3 py-2", className)}>
      <span className="sr-only">{label}</span>
      {compact ? (
        <Skeleton className="h-5 w-48 max-w-full" />
      ) : (
        Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** A whole page or area on its way (navigation, route loading): the animated mark. */
export function PageLoading({ label = "Opening" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="pm-fade-in flex flex-col items-center gap-3 py-16 text-center">
      <PrimolarMark animated className="size-14" />
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}

/** The whole screen while the app starts up, signs in or switches areas. */
export function LoadingScreen({ label = "Getting things ready" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ground px-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <PrimolarMark animated className="size-20 sm:size-24" />
        <div aria-hidden>
          {/* Sized to the name's former text-4xl / sm:text-5xl. */}
          <PrimolarName className="mx-auto block w-[9.5rem] sm:w-[12.5rem]" />
          <p className="mt-2 text-xs font-semibold tracking-brand text-ink uppercase">Pediatric Dental Clinic</p>
        </div>
      </div>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}
