<?php
date_default_timezone_set('Asia/Kolkata');

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
define('AUTH_VERSION', '1.0.8-VERIFY_PATCH');
define('ENCRYPTION_KEY', 'n3ur0_t3ch_k3y_2026'); // Replace with a more secure key in production
define('OTP_VAULT_DIR', __DIR__ . '/temp_otp');

// Ensure OTP vault exists
if (!is_dir(OTP_VAULT_DIR)) {
    mkdir(OTP_VAULT_DIR, 0755, true);
    // Add .htaccess to prevent direct access if on Apache
    if (strpos(strtolower($_SERVER['SERVER_SOFTWARE'] ?? ''), 'apache') !== false) {
        file_put_contents(OTP_VAULT_DIR . '/.htaccess', "Order Deny,Allow\nDeny from all");
    }
}

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

// OTP Helper Functions
function encrypt_data($data) {
    $iv = openssl_random_pseudo_bytes(openssl_cipher_iv_length('aes-256-cbc'));
    $encrypted = openssl_encrypt($data, 'aes-256-cbc', ENCRYPTION_KEY, 0, $iv);
    return base64_encode($encrypted . '::' . $iv);
}

function decrypt_data($data) {
    if (!$data) return null;
    $parts = explode('::', base64_decode($data), 2);
    if (count($parts) < 2) return null;
    list($encrypted_data, $iv) = $parts;
    return openssl_decrypt($encrypted_data, 'aes-256-cbc', ENCRYPTION_KEY, 0, $iv);
}

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
    $db_status = "Unknown";
    $columns = [];
    try {
        $stmt = $conn->query("DESCRIBE users");
        $cols = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $required = ['is_verified', 'profile_image'];
        $missing = array_diff($required, $cols);
        $db_status = empty($missing) ? "Ready" : "Missing columns: " . implode(', ', $missing);
        $columns = $cols;
    } catch (Exception $e) {
        $db_status = "Error: " . $e->getMessage();
    }

    $smtp_conn = "Testing...";
    $errno = 0; $errstr = "";
    $s = @fsockopen("ssl://" . SMTP_HOST, SMTP_PORT, $errno, $errstr, 5);
    if ($s) {
        $smtp_conn = "Success";
        fclose($s);
    } else {
        $smtp_conn = "Failed: $errstr ($errno)";
    }

    echo json_encode([
        "status" => "online", 
        "version" => AUTH_VERSION, 
        "db_table_status" => $db_status,
        "smtp_server_connectivity" => $smtp_conn,
        "php_mail_enabled" => function_exists('mail'),
        "columns_found" => $columns,
        "otp_vault_ready" => is_writable(OTP_VAULT_DIR)
    ]);
    exit;
}

if ($action === 'signup') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = $data['email'] ?? '';
    $username = $data['username'] ?? '';
    $pass = $data['password'] ?? '';
    $name = $data['name'] ?? $username;
    $profile_image_base64 = $data['profile_image'] ?? '';
    
    if (!$email || !$pass || !$username) {
        echo json_encode(["status" => "error", "message" => "Missing data (email, username, and password are required)"]);
        exit;
    }

    // Check if user exists (either verified or unverified)
    $stmt = $conn->prepare("SELECT id, is_verified, email FROM users WHERE email = ? OR username = ?");
    $stmt->execute([$email, $username]);
    $existingUser = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existingUser) {
        if ($existingUser['is_verified'] == 0) {
            // Unverified user exists - trigger new OTP move to verify screen
            $new_otp = sprintf("%04d", mt_rand(0, 9999));
            $new_expiry = time() + 900;
            $vault_file = OTP_VAULT_DIR . '/' . md5($existingUser['email']);
            $payload = encrypt_data(json_encode(['otp' => $new_otp, 'expiry' => $new_expiry]));
            file_put_contents($vault_file, $payload);
            
            $log = "";
            if (sendOTPEmail($existingUser['email'], $new_otp, $log)) {
                echo json_encode([
                    "status" => "unverified_exists", 
                    "email" => $existingUser['email'], 
                    "message" => "Account exists but not synchronized. New access vector sent."
                ]);
            } else {
                echo json_encode([
                    "status" => "unverified_exists", 
                    "email" => $existingUser['email'], 
                    "message" => "Account exists but verification transmission failed.",
                    "debug" => $log
                ]);
            }
            exit;
        } else {
            echo json_encode(["status" => "error", "message" => "Username or Email already exists and is verified."]);
            exit;
        }
    }

    // Generate 4-digit OTP
    $otp = sprintf("%04d", mt_rand(0, 9999));
    $expiry = time() + 900; // 15 minutes

    // Store OTP in File Vault (Encrypted)
    $vault_file = OTP_VAULT_DIR . '/' . md5($email);
    $payload = encrypt_data(json_encode([
        'otp' => $otp,
        'expiry' => $expiry
    ]));
    file_put_contents($vault_file, $payload);

    // Prepare profile image blob
    $image_blob = null;
    if ($profile_image_base64) {
        if (preg_match('/^data:image\/(\w+);base64,/', $profile_image_base64)) {
            $profile_image_base64 = substr($profile_image_base64, strpos($profile_image_base64, ',') + 1);
        }
        $image_blob = base64_decode($profile_image_base64);
    }

    $stmt = $conn->prepare("INSERT INTO users (email, username, password, name, profile_image) VALUES (?, ?, ?, ?, ?)");
    $smtp_log = "";
    if ($stmt->execute([$email, $username, $pass, $name, $image_blob])) {
        if (sendOTPEmail($email, $otp, $smtp_log)) {
            echo json_encode(["status" => "success", "message" => "Account created. Please check $email for the 4-digit access code."]);
        } else {
            echo json_encode([
                "status" => "partial_success", 
                "message" => "Account created, but failed to send verification email.",
                "debug" => $smtp_log
            ]);
        }
    } else {
        echo json_encode(["status" => "error", "message" => "Failed to create account"]);
    }

} elseif ($action === 'resend-otp') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = $data['email'] ?? '';

    if (!$email) {
        echo json_encode(["status" => "error", "message" => "Email required"]);
        exit;
    }

    // Check if user exists and is not verified
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ? AND is_verified = 0");
    $stmt->execute([$email]);
    if (!$stmt->fetch()) {
        echo json_encode(["status" => "error", "message" => "User not found or already verified"]);
        exit;
    }

    $otp = sprintf("%04d", mt_rand(0, 9999));
    $expiry = time() + 900;

    // Update OTP in File Vault
    $vault_file = OTP_VAULT_DIR . '/' . md5($email);
    $payload = encrypt_data(json_encode([
        'otp' => $otp,
        'expiry' => $expiry
    ]));
    file_put_contents($vault_file, $payload);

    $smtp_log = "";
    if (sendOTPEmail($email, $otp, $smtp_log)) {
        echo json_encode(["status" => "success", "message" => "New access vector sent to $email"]);
    } else {
        echo json_encode(["status" => "error", "message" => "Failed to send email", "debug" => $smtp_log]);
    }

} elseif ($action === 'verify-otp') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = $data['email'] ?? '';
    $otp = $data['otp'] ?? '';

    $vault_file = OTP_VAULT_DIR . '/' . md5($email);
    if (!file_exists($vault_file)) {
        echo json_encode(["status" => "error", "message" => "No active access vector found for this vector ID."]);
        exit;
    }

    $content = file_get_contents($vault_file);
    $decrypted = decrypt_data($content);
    $otp_info = json_decode($decrypted, true);

    if ($otp_info && $otp_info['otp'] === $otp && $otp_info['expiry'] > time()) {
        $stmt = $conn->prepare("UPDATE users SET is_verified = 1 WHERE email = ?");
        $stmt->execute([$email]);
        unlink($vault_file); // Clear OTP after success
        echo json_encode(["status" => "success", "message" => "Consciousness synchronized. Welcome to the network."]);
    } else {
        echo json_encode(["status" => "error", "message" => "Invalid or expired access vector."]);
    }

} elseif ($action === 'login') {
    $data = json_decode(file_get_contents("php://input"), true);
    $username = $data['username'] ?? '';
    $pass = $data['password'] ?? '';

    $stmt = $conn->prepare("SELECT * FROM users WHERE username = ? AND password = ?");
    $stmt->execute([$username, $pass]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        if ($user['is_verified'] == 0) {
             echo json_encode(["status" => "unverified_exists", "email" => $user['email'], "message" => "Neural identity not yet verified. Generating new vector..."]);
             
             // Trigger new OTP for unverified user on login attempt
             $otp = sprintf("%04d", mt_rand(0, 9999));
             $expiry = time() + 900;
             $vault_file = OTP_VAULT_DIR . '/' . md5($user['email']);
             file_put_contents($vault_file, encrypt_data(json_encode(['otp' => $otp, 'expiry' => $expiry])));
             sendOTPEmail($user['email'], $otp);
             
             exit;
        }

        unset($user['password']);
        
        // Encode profile image blob to base64 for frontend
        if ($user['profile_image']) {
            $user['avatarUrl'] = 'data:image/png;base64,' . base64_encode($user['profile_image']);
            unset($user['profile_image']); // Don't send the raw blob
        }

        echo json_encode(["status" => "success", "user" => $user, "token" => "bci_session_" . bin2hex(random_bytes(16))]);
    } else {
        echo json_encode(["status" => "error", "message" => "Invalid credentials"]);
    }

} else {
    echo json_encode(["status" => "error", "message" => "Invalid action"]);
}
?>
