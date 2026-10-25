// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

// One command in flight. No retries: a lost acknowledgement may follow a completed move.
public sealed class Protocol {
    public readonly Queue<string> Queue = new Queue<string>();
    public string Pending;
    public string Fragment = "";
    public DateTime Sent;
    public Action<string> Write, Line, Fault;
    public Action Idle;
    public bool Busy { get { return Pending != null || Queue.Count > 0; } }
    public void Clear() { Queue.Clear(); Pending = null; Fragment = ""; }
    public void Start(params string[] commands) {
        if (Busy) throw new InvalidOperationException("Poczekaj na zakończenie operacji.");
        foreach (string c in commands) Queue.Enqueue(c);
        Pump();
    }
    void Pump() {
        if (Pending != null) return;
        if (Queue.Count == 0) { if (Idle != null) Idle(); return; }
        Pending = Queue.Dequeue(); Sent = DateTime.UtcNow; Write(Pending);
    }
    public void Feed(string chunk) {
        Fragment += chunk;
        if (Fragment.Length > 65536) { Fail("Przepełnienie odbiornika"); return; }
        int end;
        while ((end = Fragment.IndexOf('\n')) >= 0) {
            string line = Fragment.Substring(0, end).Trim(); Fragment = Fragment.Substring(end + 1);
            if (Line != null) Line(line);
            if (Regex.IsMatch(line, @"^(Error:|Resend:|rs\b|start\b|rst:|!!)|Unknown command:", RegexOptions.IgnoreCase)) {
                Fail("Błąd / restart firmware: " + line); return;
            }
            if (Regex.IsMatch(line, @"^ok(?:\s|$)", RegexOptions.IgnoreCase) && Pending != null) {
                Pending = null; Pump();
            }
        }
    }
    public void CheckTimeout(double seconds) {
        if (Pending != null && (DateTime.UtcNow - Sent).TotalSeconds > seconds) Fail("Timeout. Komenda mogła się wykonać; bez ponawiania.");
    }
    void Fail(string why) { Clear(); if (Fault != null) Fault(why); }
}

public class ConsoleForm : Form {
    readonly Protocol protocol = new Protocol();
    SerialPort serial;
    DateTime settle;
    bool ready;
    readonly ComboBox ports = new ComboBox { Width = 110 };
    readonly NumericUpDown baud = Number(250000, 1200, 2000000, 0);
    readonly NumericUpDown timeout = Number(120, 5, 600, 0);
    readonly TextBox log = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, Dock = DockStyle.Fill, Font = new Font("Consolas", 10), WordWrap = false };
    readonly TextBox command = new TextBox { Width = 490 };
    readonly Label status = new Label { AutoSize = true, Text = "Rozłączony" };
    readonly CheckBox armed = new CheckBox { AutoSize = true, Text = "Potwierdzam pozycję startową i miejsce na ruch; odblokuj testy" };
    readonly NumericUpDown angle = Number(1, 0.001m, 360, 3);
    readonly NumericUpDown speed = Number(0.5m, 0.001m, 100, 3);
    readonly NumericUpDown window = Number(5, 0.01m, 360, 2);
    readonly Dictionary<char, decimal> positions = new Dictionary<char, decimal> { {'X',0}, {'Y',0}, {'Z',0} };
    readonly DataGridView runtime = Grid();
    readonly DataGridView firmware = Grid();
    readonly Dictionary<string, string> defaults = new Dictionary<string, string>();
    string headerPath, headerText;
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 25 };
    static NumericUpDown Number(decimal value, decimal min, decimal max, int places) {
        return new NumericUpDown { Maximum = max, Minimum = min, DecimalPlaces = places, Value = value, Width = 100, Increment = places > 0 ? 0.1m : 1 };
    }
    static DataGridView Grid() {
        var g = new DataGridView { Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill };
        g.Columns.Add("key", "Parametr"); g.Columns.Add("value", "Wartość"); g.Columns.Add("description", "Opis / jednostka");
        g.Columns[0].ReadOnly = g.Columns[2].ReadOnly = true;
        g.Columns[2].FillWeight = 230;
        return g;
    }
    static Button Button(string caption, Action action) {
        var b = new Button { Text = caption, AutoSize = true, Height = 32 };
        b.Click += delegate { try { action(); } catch (Exception ex) { MessageBox.Show(ex.Message, "TinyBee", MessageBoxButtons.OK, MessageBoxIcon.Warning); } };
        return b;
    }
    static FlowLayoutPanel Row(params Control[] controls) {
        var row = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(5) };
        row.Controls.AddRange(controls); return row;
    }
    static Label Label(string text) { return new Label { Text = text, AutoSize = true, Margin = new Padding(6, 8, 6, 0) }; }
    public ConsoleForm() {
        Text = "TinyBee — konsola testowa"; Width = 1150; Height = 820; MinimumSize = new Size(850, 600);
        Font = new Font("Segoe UI", 10);
        var tabs = new TabControl { Dock = DockStyle.Fill };
        var jog = new TabPage("Ruch i terminal"); var live = new TabPage("Parametry runtime"); var source = new TabPage("Wszystkie ustawienia firmware");
        tabs.TabPages.AddRange(new[] { jog, live, source }); Controls.Add(tabs);
        Controls.Add(Row(Label("COM"), ports, Button("Odśwież", RefreshPorts), Label("Baud"), baud, Button("Połącz", Connect), Button("Rozłącz", Disconnect), Label("Timeout [s]"), timeout, status));
        jog.Controls.Add(log);
        jog.Controls.Add(Row(command, Button("Wyślij linię", SendManual), Button("Zapisz log", SaveLog)));
        command.KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; try { SendManual(); } catch(Exception ex) { MessageBox.Show(ex.Message); } } };
        jog.Controls.Add(Row(Button("M115 — wersja", delegate { Send("M115"); }), Button("M503 — ustawienia", delegate { Send("M503"); }), Button("M114 — pozycja", delegate { Send("M114"); }), Button("M17 — trzymaj", delegate { RequireArmed(); Send("M17"); }), Button("STOP M410", Stop)));
        var axisRow = Row();
        foreach (char axis in "XYZ") { char a = axis; axisRow.Controls.Add(Button(a + " −", delegate { Jog(a, -1); })); axisRow.Controls.Add(Button(a + " +", delegate { Jog(a, 1); })); }
        jog.Controls.Add(axisRow);
        jog.Controls.Add(Row(Label("Kąt [°]"), angle, Label("Prędkość [°/s]"), speed, Label("Okno od startu ±[°]"), window));
        jog.Controls.Add(Row(armed));
        jog.Controls.Add(Row(Label("X: przegub 1 | Y: przegub 2 | Z: podstawa. Pozycja jest wyliczana, bez enkoderów. STOP po serialu może być opóźniony.")));
        armed.CheckedChanged += delegate { if (armed.Checked) { if (!ready || protocol.Busy) { armed.Checked = false; return; } foreach(char a in "XYZ") positions[a] = 0; Log("Nowy lokalny punkt startowy; bez G92. Okno aplikacji nie wykrywa kolizji."); } };
        window.ValueChanged += delegate { armed.Checked = false; };
        live.Controls.Add(runtime);
        live.Controls.Add(Row(Button("Wyślij zaznaczony parametr", ApplyRuntime), Button("Odczytaj M503 do logu", delegate { Send("M503"); })));
        live.Controls.Add(Row(Label("Wartości początkowe z pliku. M503 pokazuje faktyczny stan w terminalu. Zmiany runtime znikają po resecie; brak EEPROM.")));
        source.Controls.Add(firmware);
        source.Controls.Add(Row(Button("Wczytaj RobotSettings.h", LoadHeaderDialog), Button("Zapisz jako…", ExportHeader)));
        source.Controls.Add(Row(Label("Edycja wszystkich stałych ROBOT_*. Zapis nie zmienia płyty: potrzebne build + upload. Mikrokrok i prąd ustawia też sprzęt.")));
        protocol.Write = delegate(string c) { serial.Write(c + "\n"); Log("> " + c); };
        protocol.Line = delegate(string line) { Log("< " + line); };
        protocol.Fault = delegate(string why) { Log(why); Disconnect(); status.Text = "Błąd — połącz ponownie"; };
        protocol.Idle = delegate { status.Text = "Gotowy"; };
        timer.Tick += Tick; timer.Start();
        FormClosing += delegate { Disconnect(); };
        RefreshPorts(); FindHeader();
    }
    void Log(string line) { if(log.TextLength > 150000) log.Clear(); log.AppendText(DateTime.Now.ToString("HH:mm:ss.fff ") + line + Environment.NewLine); }
    void RefreshPorts() { string old = ports.Text; ports.Items.Clear(); ports.Items.AddRange(SerialPort.GetPortNames()); if (old != "") ports.Text = old; else if (ports.Items.Count > 0) ports.SelectedIndex = 0; }
    void Connect() {
        Disconnect();
        serial = new SerialPort(ports.Text, (int)baud.Value, Parity.None, 8, StopBits.One) { DtrEnable = false, RtsEnable = false, Handshake = Handshake.None, WriteTimeout = 500, Encoding = Encoding.ASCII };
        try { serial.Open(); settle = DateTime.UtcNow.AddSeconds(2); status.Text = "Synchronizacja…"; Log("Port otwarty. Bez automatycznego ruchu."); }
        catch { Disconnect(); throw; }
    }
    void Disconnect() {
        ready = false; armed.Checked = false; protocol.Clear();
        if(serial != null) { try { serial.Dispose(); } catch {} serial = null; }
        status.Text = "Rozłączony";
    }
    void Tick(object sender, EventArgs e) {
        if(serial == null) return;
        try {
            string data = serial.ReadExisting();
            if(!ready) {
                if(data.Length > 0) { Log(data.Trim()); settle = DateTime.UtcNow.AddSeconds(1); }
                if(DateTime.UtcNow >= settle) { ready = true; protocol.Start("M115", "M503", "M114"); }
            } else { protocol.Feed(data); if(serial != null) protocol.CheckTimeout((double)timeout.Value); }
        } catch(Exception ex) { Log(ex.Message); Disconnect(); }
    }
    void Send(params string[] commands) {
        if(!ready || serial == null) throw new InvalidOperationException("Najpierw połącz port i poczekaj na synchronizację.");
        try { protocol.Start(commands); } catch(IOException) { Disconnect(); throw; } catch(TimeoutException) { Disconnect(); throw; }
    }
    void RequireArmed() { if(!armed.Checked) throw new InvalidOperationException("Potwierdź pozycję startową i miejsce na ruch."); }
    void Jog(char axis, int direction) {
        RequireArmed(); if(protocol.Busy) throw new InvalidOperationException("Poprzednia operacja trwa.");
        decimal delta = direction * angle.Value, target = positions[axis] + delta;
        if(Math.Abs(target) > window.Value) throw new InvalidOperationException("Ruch przekracza lokalne okno od pozycji startowej.");
        if(angle.Value / speed.Value + 5 > timeout.Value) throw new InvalidOperationException("Zwiększ timeout dla tak długiego ruchu.");
        Send("G21", "G91", "G1 " + axis + F(delta) + " F" + F(speed.Value * 60), "M400", "G90", "M114");
        positions[axis] = target; status.Text = "Ruch — oczekiwanie na M400";
    }
    static string F(decimal value) { return value.ToString("0.######", CultureInfo.InvariantCulture); }
    void SendManual() {
        string c = command.Text.Trim();
        if(c.Length == 0 || c.Length > 90 || c.IndexOfAny(new[]{'\r','\n'}) >= 0 || !Regex.IsMatch(c, @"^[\x20-\x7e]+$")) throw new Exception("Wpisz jedną linię ASCII, maks. 90 znaków.");
        bool readOnly = Regex.IsMatch(c, @"^M(115|114|119|503)\s*$", RegexOptions.IgnoreCase);
        if(!readOnly) { RequireArmed(); if(MessageBox.Show("Wyślij ręcznie: " + c + "?\nTerminal omija lokalne limity ruchu. Po wysłaniu odniesienie zostanie unieważnione.", "Ręczny G-code", MessageBoxButtons.YesNo) != DialogResult.Yes) return; }
        Send(c); if(!readOnly) armed.Checked = false; command.Clear();
    }
    void Stop() {
        if(serial == null) return;
        // Do not misassociate the old command's acknowledgement with M410: close this session.
        try { protocol.Clear(); serial.Write("M410\n"); Log("> M410 (bez potwierdzenia; sesja zamknięta)"); }
        finally { Disconnect(); }
        MessageBox.Show("Wysłano M410. Może czekać za M400; nie jest sprzętowym E-stopem. Przed kolejnym ruchem sprawdź pozycję.");
    }
    void SaveLog() { using(var d = new SaveFileDialog { Filter = "Log|*.log", FileName = "tinybee.log" }) if(d.ShowDialog() == DialogResult.OK) File.WriteAllText(d.FileName, log.Text, Encoding.UTF8); }
    void FindHeader() {
        DirectoryInfo dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
        while(dir != null) { string p = Path.Combine(dir.FullName, "Marlin", "RobotSettings.h"); if(File.Exists(p)) { LoadHeader(p); return; } dir = dir.Parent; }
        Log("Wczytaj RobotSettings.h w zakładce ustawień.");
    }
    void LoadHeaderDialog() { using(var d = new OpenFileDialog { Filter = "RobotSettings.h|RobotSettings.h|Header|*.h" }) if(d.ShowDialog() == DialogResult.OK) LoadHeader(d.FileName); }
    void LoadHeader(string path) {
        headerPath = path; headerText = File.ReadAllText(path); defaults.Clear(); firmware.Rows.Clear(); string description = "";
        foreach(string line in headerText.Split('\n')) {
            if(line.StartsWith("// Ponizej adapter")) break;
            if(line.StartsWith("//")) { description += line.Substring(2).Trim() + " "; continue; }
            Match m = Regex.Match(line, @"^#define\s+(ROBOT_\w+)\s+(\S+)\s*$");
            if(m.Success) { defaults[m.Groups[1].Value] = m.Groups[2].Value; firmware.Rows.Add(m.Groups[1].Value, m.Groups[2].Value, description.Trim()); }
            else if(string.IsNullOrWhiteSpace(line)) description = "";
        }
        PopulateRuntime(); baud.Value = Value("ROBOT_SERIAL_BAUD"); Log("Wczytano " + path);
    }
    decimal Value(string key) { return decimal.Parse(defaults[key].TrimEnd('f'), CultureInfo.InvariantCulture); }
    void PopulateRuntime() {
        runtime.Rows.Clear();
        foreach(char a in "XYZ") {
            string p = "ROBOT_" + a + "_";
            decimal steps = Value(p+"MOTOR_STEPS") * Value(p+"MICROSTEPS") * Value(p+"OUTPUT_TEETH") / Value(p+"MOTOR_TEETH") / 360 * Value(p+"STEP_CORRECTION");
            runtime.Rows.Add("M92 " + a, F(steps), "Impulsy / stopień — zmiana skali, wymaga ponownego odniesienia");
            runtime.Rows.Add("M203 " + a, F(Value(p+"MAX_SPEED_DPS")), "Maks. prędkość [°/s]");
            runtime.Rows.Add("M201 " + a, F(Value(p+"MAX_ACCEL_DPS2")), "Maks. przyspieszenie [°/s²], liczba całkowita");
        }
        AddRuntime("M204 P", "ROBOT_MOVE_ACCEL_DPS2", "Przyspieszenie print [°/s²]");
        AddRuntime("M204 T", "ROBOT_TRAVEL_ACCEL_DPS2", "Przyspieszenie ruchu ramienia (travel) [°/s²]");
        AddRuntime("M205 J", "ROBOT_JUNCTION_DEVIATION_DEG", "Łączenie odcinków, zakres Marlin 0.01–0.3; fabryczne 0.005 wymaga firmware");
        AddRuntime("M205 S", "ROBOT_MIN_SPEED_DPS", "Minimalna prędkość print [°/s]");
        AddRuntime("M205 T", "ROBOT_MIN_SPEED_DPS", "Minimalna prędkość travel [°/s]");
        AddRuntime("M205 B", "ROBOT_MIN_SEGMENT_TIME_US", "Minimalny czas segmentu [µs], całkowity");
        AddRuntime("M84 S", "ROBOT_IDLE_TIMEOUT_SEC", "Timeout zwolnienia silników [s]; 0 = trzymaj stale");
    }
    void AddRuntime(string code, string key, string desc) { runtime.Rows.Add(code, F(Value(key)), desc); }
    void ApplyRuntime() {
        runtime.EndEdit(); if(runtime.CurrentRow == null) return;
        string key = (string)runtime.CurrentRow.Cells[0].Value;
        decimal n; if(!decimal.TryParse(Convert.ToString(runtime.CurrentRow.Cells[1].Value).Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out n) || n < 0 || n > 1000000) throw new Exception("Wartość musi być liczbą 0–1000000.");
        if((key.StartsWith("M92") || key.StartsWith("M20") && !key.StartsWith("M205")) && n <= 0) throw new Exception("Wartość musi być dodatnia.");
        if((key.StartsWith("M201") || key == "M205 B" || key == "M84 S") && n != decimal.Truncate(n)) throw new Exception("Wymagana liczba całkowita.");
        if(key == "M205 J" && (n < 0.01m || n > 0.3m)) throw new Exception("Marlin M205 J przyjmuje 0.01–0.3. Domyślne 0.005 pozostaw bez wysyłania lub zmień firmware.");
        Send(key + F(n), "M503"); armed.Checked = false;
    }
    void ExportHeader() {
        firmware.EndEdit(); if(headerText == null) throw new Exception("Najpierw wczytaj plik.");
        string result = headerText;
        foreach(DataGridViewRow row in firmware.Rows) {
            string key = (string)row.Cells[0].Value, value = Convert.ToString(row.Cells[1].Value).Trim();
            if(key.EndsWith("_DRIVER")) { if(!Regex.IsMatch(value, @"^[A-Z][A-Z0-9_]*$")) throw new Exception("Nieprawidłowy typ sterownika: " + key); }
            else if(key.EndsWith("_INVERT_DIR")) { if(value != "true" && value != "false") throw new Exception(key + ": true lub false"); }
            else if(!Regex.IsMatch(value, @"^-?\d+(\.\d+)?f?$")) throw new Exception("Nieprawidłowa liczba: " + key);
            result = Regex.Replace(result, @"(?m)^(#define\s+" + key + @"\s+)\S+", "${1}" + value);
        }
        using(var d = new SaveFileDialog { Filter = "C++ header|*.h", FileName = "RobotSettings.h", InitialDirectory = Path.GetDirectoryName(headerPath) }) {
            if(d.ShowDialog() != DialogResult.OK) return;
            File.WriteAllText(d.FileName, result, new UTF8Encoding(false)); Log("Zapisano " + d.FileName + ". Wymagany build + upload; sprawdź diff.");
        }
    }
    [STAThread] public static void Main(string[] args) {
        if(args.Length > 0 && args[0] == "--self-test") { SelfTest.Run(); using(var form = new ConsoleForm()) { form.CreateControl(); } return; }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new ConsoleForm());
    }
}

static class SelfTest {
    static void Assert(bool v) { if(!v) throw new Exception("Test failed"); }
    public static void Run() {
        var sent = new List<string>(); string fault = null; var p = new Protocol { Write = sent.Add, Fault = delegate(string s) { fault = s; } };
        p.Start("G1 X1", "M400"); p.Feed("echo:busy\nok"); Assert(sent.Count == 1); p.Feed(" N0\r\n"); Assert(sent.Count == 2 && p.Pending == "M400");
        p.Feed("ok\n"); Assert(!p.Busy);
        p.Start("G1 X1", "G90"); p.Feed("Error:bad\nok\n"); Assert(!p.Busy && fault != null && sent.Count == 3);
        fault = null; p.Start("G1 X1"); p.Sent = DateTime.UtcNow.AddMinutes(-5); p.CheckTimeout(10); Assert(fault != null && !p.Busy && sent.Count == 4);
        foreach(string reset in new[]{"start\n", "rst:0x1\n", "Resend: 1\n", "echo:Unknown command: M17\n"}) { fault = null; p.Start("M115", "G1 X1"); p.Feed(reset); Assert(fault != null && !p.Busy); }
        File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "self-test.log"), "PASS: framing, acknowledgements, errors, reset, resend, timeout, no retries\n");
    }
}
