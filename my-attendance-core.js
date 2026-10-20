// 我的出缺席（10/20 新增）：首頁「我的音樂會」卡片出缺席摘要與明細 sheet 的純計算邏輯，
// 不碰 Firestore 和 DOM，用 node:test 測試（tests/unit/my-attendance-core.test.mjs）。
// 規則見 docs/superpowers/specs/2026-10-20-my-attendance-design.md「統計規則」

function pad2(n){ return (n < 10 ? '0' : '') + n; }

export function formatMD(dateMs){
  var d = new Date(dateMs);
  return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate());
}

function checkinNote(c){
  if (c.method === 'manual') return '幹部補登簽到';
  var d = new Date(c.checkedInAtMs);
  return d.getHours() + ':' + pad2(d.getMinutes()) + ' 簽到';
}

function reportedText(report){
  if (!report) return '尚未回報';
  return report.status === 'leave' ? '已回報請假' : '已回報出席';
}

// 回傳 { [concertId]: { counts, counted, excluded } }，concertIds 每一個都有一筆
export function buildMyAttendance(input){
  var inRoster = {};
  (input.rosterEventIds || []).forEach(function(id){ inRoster[id] = true; });
  var reportBy = {};
  (input.reports || []).forEach(function(r){ reportBy[r.eventId] = r; });
  var checkinBy = {};
  (input.checkins || []).forEach(function(c){ checkinBy[c.eventId] = c; });

  var result = {};
  (input.concertIds || []).forEach(function(id){
    result[id] = { counts: { attended: 0, leave: 0, absent: 0 }, counted: [], excluded: [] };
  });

  (input.events || []).forEach(function(ev){
    var bucket = result[ev.concertId];
    if (!bucket) return;
    var checkin = checkinBy[ev.id];
    var report = reportBy[ev.id];
    var held = ev.dateMs < input.tomorrowStartMs;
    var row = { eventId: ev.id, title: ev.title, dateMs: ev.dateMs, status: null, note: '', warn: false };

    // 我自己的簽到就證明這場有開放簽到——旗標還沒補建或暫時不同步時，出席不會因此消失
    if (held && (ev.hasCheckins === true || checkin) && (inRoster[ev.id] || checkin)){
      if (checkin){
        row.status = 'attended';
        row.note = checkinNote(checkin);
      } else if (report && report.status === 'leave'){
        row.status = 'leave';
        row.note = report.reason ? '請假・' + report.reason : '請假';
      } else {
        row.status = 'absent';
        row.note = report ? '回報出席，但沒有簽到紀錄' : '沒有回報';
        row.warn = !!report;
      }
      bucket.counts[row.status]++;
      bucket.counted.push(row);
    } else if (inRoster[ev.id] || checkin){
      row.note = held ? '這場沒有開放簽到' : '尚未舉行・' + reportedText(report);
      bucket.excluded.push(row);
    }
  });

  Object.keys(result).forEach(function(id){
    var byDateDesc = function(a, b){ return b.dateMs - a.dateMs; };
    result[id].counted.sort(byDateDesc);
    result[id].excluded.sort(byDateDesc);
  });
  return result;
}
