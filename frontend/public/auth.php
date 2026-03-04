<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

// Diagnostic mode - Enable for debugging 503 errors
error_reporting(E_ALL);
ini_set('display_errors', 1);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$host = "localhost"; 
$db_name = "withadae_neurotech";
$username = "withadae_neuro_admin";
$password = 'firstSep@7219'; 
define('AUTH_VERSION', '1.0.4-DRY_RUN_LOGS');

try {
    $conn = new PDO("mysql:host=$host;dbname=$db_name", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $conn->exec("SET NAMES utf8mb4");
} catch(PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Connection failed: " . $e->getMessage()]);
    exit;
}

// SMTP Settings
define('SMTP_HOST', 'mail.withaspire.in');
define('SMTP_USER', 'neurotech@withaspire.in');
define('SMTP_PASS', 'firstSep@7219');
define('SMTP_PORT', 465);

function sendOTPEmail($to, $otp, &$log = "") {
    $subject = "Welcome to the World of Neurons";
    $from = SMTP_USER;
    
    $message = "
    <html>
    <body style='background-color: #0a0a0a; color: #ffffff; font-family: Arial, sans-serif; padding: 40px;'>
        <div style='max-width: 600px; margin: 0 auto; border: 1px solid #333; border-radius: 12px; padding: 30px; background: linear-gradient(145deg, #121212, #000000);'>
            <h1 style='color: #00f2fe; text-align: center; text-transform: uppercase; letter-spacing: 2px;'>The Neural Gate Awaits</h1>
            <p style='font-size: 18px; line-height: 1.6; text-align: center; color: #b0b0b0;'>
                Welcome, traveler. You are about to step into the vast, electric expanse of the human mind. 
                The synapses are firing, the signals are clear, and your entry is nearly complete.
            </p>
            <div style='background: rgba(0, 242, 254, 0.1); border: 1px solid #00f2fe; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;'>
                <span style='display: block; font-size: 12px; text-transform: uppercase; color: #00f2fe; margin-bottom: 10px;'>Your Access Vector</span>
                <span style='font-size: 48px; font-weight: bold; letter-spacing: 12px; color: #ffffff;'>$otp</span>
            </div>
            <p style='color: #666; font-size: 14px; text-align: center;'>
                Enter these four digits to harmonize your consciousness with our network.
            </p>
            <hr style='border: 0; border-top: 1px solid #333; margin: 30px 0;'>
            <p style='font-size: 12px; text-align: center; color: #444;'>
                NeuroTECH System // Synchronizing. Please do not reply to this transmission.
            </p>
        </div>
    </body>
    </html>
    ";

    $headers = [
        "MIME-Version: 1.0",
        "Content-type: text/html; charset=UTF-8",
        "From: NeuroTECH <$from>",
        "To: $to",
        "Subject: $subject"
    ];

    try {
        $host = "ssl://" . SMTP_HOST;
        $socket = fsockopen($host, SMTP_PORT, $errno, $errstr, 15);
        if (!$socket) {
            $log = "Connection Failed: $errstr ($errno)";
            return false;
        }

        $getResponse = function($socket) use (&$log) {
            $response = "";
            while ($str = fgets($socket, 4096)) {
                $response .= $str;
                $log .= "> " . $str;
                if (substr($str, 3, 1) == " ") break;
            }
            return $response;
        };

        $log .= "Connecting to $host...\n";
        $getResponse($socket);
        
        $cmds = [
            "EHLO " . ($_SERVER['HTTP_HOST'] ?? 'localhost') => "EHLO sent",
            "AUTH LOGIN" => "AUTH LOGIN started",
            base64_encode(SMTP_USER) => "User sent",
            base64_encode(SMTP_PASS) => "Pass sent",
            "MAIL FROM: <$from>" => "Mail From sent",
            "RCPT TO: <$to>" => "Recipient sent",
            "DATA" => "Data start sent"
        ];

        foreach ($cmds as $cmd => $desc) {
            fwrite($socket, $cmd . "\r\n");
            $res = $getResponse($socket);
            if (substr($res, 0, 1) >= '4') {
                $log .= "Error at $desc: $res";
                return false;
            }
        }

        fwrite($socket, implode("\r\n", $headers) . "\r\n\r\n" . $message . "\r\n.\r\n");
        $getResponse($socket);
        fwrite($socket, "QUIT\r\n");
        fclose($socket);
        return true;
    } catch (Exception $e) {
        $log .= "Exception: " . $e->getMessage();
        return false;
    }
}

$action = $_GET['action'] ?? '';

if ($action === 'test') {
    echo json_encode([
        "status" => "online", 
        "version" => AUTH_VERSION, 
        "php_mail_enabled" => function_exists('mail'),
        "smtp_host" => SMTP_HOST
    ]);
    exit;
}

if ($action === 'signup') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = $data['email'] ?? '';
    $pass = $data['password'] ?? '';
    $name = $data['name'] ?? explode('@', $email)[0];
    
    if (!$email || !$pass) {
        echo json_encode(["status" => "error", "message" => "Missing data"]);
        exit;
    }

    // Generate 4-digit OTP
    $otp = sprintf("%04d", mt_rand(0, 9999));
    $expiry = date('Y-m-d H:i:s', strtotime('+15 minutes'));

    $stmt = $conn->prepare("INSERT INTO users (email, password, name, otp_code, otp_expiry) VALUES (?, ?, ?, ?, ?)");
    $smtp_log = "";
    if ($stmt->execute([$email, $pass, $name, $otp, $expiry])) {
        if (sendOTPEmail($email, $otp, $smtp_log)) {
            echo json_encode(["status" => "success", "message" => "Account created. Please check your email for the 4-digit access code."]);
        } else {
            echo json_encode([
                "status" => "partial_success", 
                "message" => "Account created, but failed to send verification email. Please check your spam folder or contact support.",
                "debug" => $smtp_log
            ]);
        }
    } else {
        echo json_encode(["status" => "error", "message" => "Failed to create account"]);
    }

} elseif ($action === 'verify-otp') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = $data['email'] ?? '';
    $otp = $data['otp'] ?? '';

    $stmt = $conn->prepare("SELECT * FROM users WHERE email = ? AND otp_code = ? AND otp_expiry > NOW()");
    $stmt->execute([$email, $otp]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        $stmt = $conn->prepare("UPDATE users SET is_verified = 1, otp_code = NULL WHERE email = ?");
        $stmt->execute([$email]);
        echo json_encode(["status" => "success", "message" => "Consciousness synchronized. Welcome to the network."]);
    } else {
        echo json_encode(["status" => "error", "message" => "Invalid or expired access vector."]);
    }

} elseif ($action === 'login') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = $data['email'] ?? '';
    $pass = $data['password'] ?? '';

    $stmt = $conn->prepare("SELECT * FROM users WHERE email = ? AND password = ?");
    $stmt->execute([$email, $pass]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        unset($user['password']);
        echo json_encode(["status" => "success", "user" => $user, "token" => "bci_session_" . bin2hex(random_bytes(16))]);
    } else {
        echo json_encode(["status" => "error", "message" => "Invalid credentials"]);
    }

} else {
    echo json_encode(["status" => "error", "message" => "Invalid action"]);
}
?>
