import bcrypt from 'bcryptjs';
import { getPool } from '../config/db.js';

const PASSWORD = 'Password@123';

function pad(n, w = 6) {
  return String(n).padStart(w, '0');
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function isoDateTime(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function seed() {
  const pool = getPool();
  const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (c > 0) {
    console.log('Database already seeded (users present). Skipping.');
    process.exit(0);
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const pops = [
      ['POP-BLR', 'Bangalore Central', 'Bengaluru', 10000],
      ['POP-HYD', 'Hyderabad Hub', 'Hyderabad', 8000],
      ['POP-DEL', 'Delhi North', 'Delhi', 12000],
      ['POP-MUM', 'Mumbai West', 'Mumbai', 15000],
    ];
    for (const p of pops) {
      await conn.execute(
        `INSERT INTO pops (code, name, city, capacity_mbps) VALUES (?, ?, ?, ?)`,
        p
      );
    }

    const plans = [
      ['Fiber Home 50', 'B2C', 50, 500, 499.0],
      ['Fiber Home 100', 'B2C', 100, 1000, 799.0],
      ['Fiber Home 300', 'B2C', 300, null, 1299.0],
      ['Fiber Home 500', 'B2C', 500, null, 1799.0],
      ['Biz Link 100', 'B2B', 100, null, 2499.0],
      ['Biz Link 300', 'B2B', 300, null, 4499.0],
      ['Biz Link 500', 'B2B', 500, null, 6999.0],
      ['Biz Link 1000', 'B2B', 1000, null, 9999.0],
    ];
    for (const p of plans) {
      await conn.execute(
        `INSERT INTO plans (name, segment, speed_mbps, data_cap_gb, monthly_price, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
        p
      );
    }

    const [planRows] = await conn.query('SELECT id, segment, monthly_price FROM plans ORDER BY id');
    const [popRows] = await conn.query('SELECT id FROM pops ORDER BY id');
    const b2cPlans = planRows.filter((p) => p.segment === 'B2C');
    const b2bPlans = planRows.filter((p) => p.segment === 'B2B');

    const statuses = ['Pending', 'Active', 'Suspended', 'Terminated'];
    const subscriberIds = [];
    for (let i = 1; i <= 42; i++) {
      const type = i % 3 === 0 ? 'B2B' : 'B2C';
      const [r] = await conn.execute(
        `INSERT INTO subscribers (name, type, email, phone, address, company_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          type === 'B2B' ? `Biz Customer ${i}` : `Home User ${i}`,
          type,
          `sub${i}@example.test`,
          `900000${pad(i, 4)}`,
          `${i} Network Lane, City`,
          type === 'B2B' ? `Company ${i} Pvt Ltd` : null,
        ]
      );
      subscriberIds.push({ id: r.insertId, type });
    }

    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const cycleStart = isoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));

    const connectionIds = [];
    let ipCounter = 10;
    for (let i = 0; i < subscriberIds.length; i++) {
      const sub = subscriberIds[i];
      const planPool = sub.type === 'B2B' ? b2bPlans : b2cPlans;
      const plan = planPool[i % planPool.length];
      const pop = popRows[i % popRows.length];
      // Ensure seeded buyer subscribers (first B2C i=0, first B2B i=2) have Active connections
      const status = i === 0 || i === 2 ? 'Active' : statuses[i % statuses.length];
      const withIp = i < 12 || status === 'Active';
      const staticIp = withIp && status !== 'Terminated' ? `10.20.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}` : null;
      if (staticIp) ipCounter += 1;
      const activated =
        status === 'Active' || status === 'Suspended' || status === 'Terminated'
          ? isoDateTime(addDays(today, -30))
          : null;
      const terminated = status === 'Terminated' ? isoDateTime(addDays(today, -2)) : null;
      const [r] = await conn.execute(
        `INSERT INTO connections
         (subscriber_id, plan_id, pop_id, status, static_ip, connection_code, activated_at, terminated_at, billing_cycle_start)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sub.id,
          plan.id,
          pop.id,
          status,
          staticIp,
          `NX-${pad(i + 1)}`,
          activated,
          terminated,
          cycleStart,
        ]
      );
      connectionIds.push({ id: r.insertId, subscriberId: sub.id, planId: plan.id, status });
    }

    // Users
    const [buyerSub] = subscriberIds.filter((s) => s.type === 'B2C');
    const [buyerB2b] = subscriberIds.filter((s) => s.type === 'B2B');

    const users = [
      ['Admin User', 'admin@nexushub.test', 'admin', null],
      ['Support Lead', 'lead@nexushub.test', 'support_lead', null],
      ['Support Agent', 'agent@nexushub.test', 'support_agent', null],
      ['Tech One', 'tech1@nexushub.test', 'technician', null],
      ['Tech Two', 'tech2@nexushub.test', 'technician', null],
      ['Tech Three', 'tech3@nexushub.test', 'technician', null],
      ['Buyer B2C', 'buyer@nexushub.test', 'buyer', buyerSub.id],
      ['Buyer B2B', 'buyer.b2b@nexushub.test', 'buyer', buyerB2b.id],
    ];
    const userIds = {};
    for (const u of users) {
      const [r] = await conn.execute(
        `INSERT INTO users (name, email, password_hash, role, subscriber_id, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
        [u[0], u[1], hash, u[2], u[3]]
      );
      userIds[u[1]] = r.insertId;
    }

    const techIds = [userIds['tech1@nexushub.test'], userIds['tech2@nexushub.test'], userIds['tech3@nexushub.test']];
    const shiftWindows = [
      ['09:00:00', '17:00:00'],
      ['12:00:00', '20:00:00'],
      ['08:00:00', '16:00:00'],
    ];
    for (let d = 0; d < 8; d++) {
      const date = isoDate(addDays(today, d));
      for (let t = 0; t < techIds.length; t++) {
        await conn.execute(
          `INSERT INTO technician_shifts (technician_id, shift_date, start_time, end_time) VALUES (?, ?, ?, ?)`,
          [techIds[t], date, shiftWindows[t][0], shiftWindows[t][1]]
        );
      }
    }

    const agentId = userIds['agent@nexushub.test'];
    const leadId = userIds['lead@nexushub.test'];
    const priorities = ['Low', 'Medium', 'High', 'Critical'];
    const ticketStatuses = ['Open', 'In-Progress', 'Field Visit', 'Resolved'];
    const taskTypes = ['Feeder Line Audit', 'ONU Configuration', 'Splicing', 'Fiber Repair', 'Router Replacement', 'Other'];

    const activeConns = connectionIds.filter((c) => c.status !== 'Terminated');
    const ticketIds = [];
    for (let i = 0; i < 22; i++) {
      const status = ticketStatuses[i % ticketStatuses.length];
      const priority = priorities[i % priorities.length];
      const hours = { Critical: 4, High: 8, Medium: 24, Low: 72 }[priority];
      let createdAt = addDays(today, -Math.floor(i / 2));
      let slaDue = new Date(createdAt.getTime() + hours * 3600 * 1000);
      // Force some breaches and at-risk
      if (i < 3) {
        createdAt = addDays(today, -5);
        slaDue = addDays(today, -1);
      } else if (i === 3 || i === 4) {
        slaDue = new Date(today.getTime() + 30 * 60 * 1000);
      }
      const rankByStatus = ticketIds.filter((t) => t.status === status).length;
      const connRow = activeConns[i % activeConns.length];
      const [r] = await conn.execute(
        `INSERT INTO tickets
         (ticket_no, connection_id, title, description, priority, status, rank_index, created_by, sla_due_at, resolved_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `TK-${pad(i + 1)}`,
          connRow.id,
          [
            'Intermittent drops after dusk',
            'No link light on ONU',
            'Slow speeds during peak hours',
            'Wi-Fi SSID missing after power cut',
            'Static IP not reachable',
            'Packet loss on feeder',
            'ONT red LOS alarm',
            'Plan upgrade not reflected',
            'Billing dispute — suspended in error',
            'New install activation pending',
            'Fiber cut near junction box',
            'Router reboot loop',
            'B2B dedicated line flapping',
            'CPE replacement requested',
            'SLA review — recurring outages',
            'Customer relocation — port move',
            'High latency to POP',
            'VoIP quality degradation',
            'Outdoor AP offline',
            'Duplicate MAC on segment',
            'Scheduled maintenance follow-up',
            'Cross-connect audit required',
          ][i % 22],
          `Customer reported: ${
            [
              'connection drops every evening',
              'no sync after storm',
              'throughput far below plan',
              'home Wi-Fi vanished',
              'cannot reach static IP',
              'frequent packet loss',
              'LOS alarm on ONT',
              'speed still on old plan',
              'service suspended unexpectedly',
              'waiting for first activation',
              'outage after road work',
              'gateway keeps rebooting',
              'dedicated circuit unstable',
              'hardware failure suspected',
              'multiple outages this month',
              'moving premises next week',
              'high RTT to POP',
              'call quality issues',
              'AP not coming online',
              'MAC conflict reported',
              'confirm post-maintenance status',
              'verify cross-connect labels',
            ][i % 22]
          }.`,
          priority,
          status,
          rankByStatus,
          i % 2 === 0 ? agentId : leadId,
          isoDateTime(slaDue),
          status === 'Resolved' ? isoDateTime(today) : null,
          isoDateTime(createdAt),
        ]
      );
      ticketIds.push({ id: r.insertId, status, no: `TK-${pad(i + 1)}` });
    }

    // Sub-tasks for several tickets
    let taskRank = { Open: 0, 'In-Progress': 0, 'Field Visit': 0, Resolved: 0 };
    for (let i = 0; i < 12; i++) {
      const ticket = ticketIds[i];
      const count = 2 + (i % 3);
      for (let j = 0; j < count; j++) {
        const status = j === 0 ? ticket.status : ticketStatuses[(i + j) % 4];
        let techId = null;
        let wStart = null;
        let wEnd = null;
        if (status !== 'Open' || i < 6) {
          techId = techIds[j % techIds.length];
          const dayOffset = j === 0 ? 0 : 1;
          const base = addDays(today, dayOffset);
          const hour = 10 + j * 2;
          wStart = isoDateTime(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour, 0, 0)));
          wEnd = isoDateTime(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour + 1, 0, 0)));
        }
        const rank = taskRank[status]++;
        await conn.execute(
          `INSERT INTO ticket_tasks
           (ticket_id, title, task_type, description, status, rank_index, technician_id, window_start, window_end, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ticket.id,
            `${taskTypes[j % taskTypes.length]} — site visit`,
            taskTypes[j % taskTypes.length],
            'Field work for this ticket',
            status,
            rank,
            status === 'Open' && i >= 6 ? null : techId,
            status === 'Open' && i >= 6 ? null : wStart,
            status === 'Open' && i >= 6 ? null : wEnd,
            status === 'Resolved' ? isoDateTime(today) : null,
          ]
        );
      }
    }

    // Historical plan change + billing for first active connection
    const active = connectionIds.find((c) => c.status === 'Active');
    if (active) {
      const fromPlan = planRows[0].id;
      const toPlan = planRows[1].id;
      const [pc] = await conn.execute(
        `INSERT INTO plan_changes (connection_id, from_plan_id, to_plan_id, change_type, effective_date, requested_by)
         VALUES (?, ?, ?, 'upgrade', ?, ?)`,
        [active.id, fromPlan, toPlan, isoDate(today), userIds['buyer@nexushub.test']]
      );
      await conn.execute(
        `INSERT INTO billing_logs
         (connection_id, plan_change_id, entry_type, description, amount, period_start, period_end, days_used, days_in_cycle)
         VALUES (?, ?, 'proration', 'Credit old plan', -200.00, ?, ?, 10, 30)`,
        [active.id, pc.insertId, cycleStart, isoDate(addDays(new Date(cycleStart), 29))]
      );
      await conn.execute(
        `INSERT INTO billing_logs
         (connection_id, plan_change_id, entry_type, description, amount, period_start, period_end, days_used, days_in_cycle)
         VALUES (?, ?, 'proration', 'Charge new plan', 350.00, ?, ?, 10, 30)`,
        [active.id, pc.insertId, cycleStart, isoDate(addDays(new Date(cycleStart), 29))]
      );
      await conn.execute(
        `INSERT INTO audit_logs (entity_type, entity_id, action, old_value, new_value, actor_id)
         VALUES ('plan_change', ?, 'PLAN_CHANGED', CAST(? AS JSON), CAST(? AS JSON), ?)`,
        [
          pc.insertId,
          JSON.stringify({ plan_id: fromPlan }),
          JSON.stringify({ plan_id: toPlan, net: 150 }),
          userIds['buyer@nexushub.test'],
        ]
      );
    }

    await conn.execute(
      `INSERT INTO audit_logs (entity_type, entity_id, action, old_value, new_value, actor_id)
       VALUES ('connection', ?, 'CONNECTION_CREATED', NULL, CAST(? AS JSON), ?)`,
      [connectionIds[0].id, JSON.stringify({ connection_code: 'NX-000001' }), userIds['admin@nexushub.test']]
    );

    await conn.commit();
    console.log('Seed complete. Password for all users: Password@123');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
