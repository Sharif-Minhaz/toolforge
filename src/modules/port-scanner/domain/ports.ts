import type { PortPreset } from "../types";

/**
 * What each port is conventionally *for*.
 *
 * A label, not a finding. Nothing in this tool reads a banner or probes for a
 * version, so "22 is SSH" means the IANA registration and the convention every
 * operator follows — not that SSH answered. A host is free to run anything
 * anywhere, and one that runs a web server on 22 is exactly the sort of thing
 * this table will describe wrongly. That is the honest trade for not
 * fingerprinting.
 *
 * Names are proper names, so they stay here as data rather than going through
 * the message catalogue: `SSH` is `SSH` in both locales.
 */
const SERVICES: Readonly<Record<number, string>> = {
    20: "FTP data",
    21: "FTP",
    22: "SSH",
    23: "Telnet",
    25: "SMTP",
    53: "DNS",
    67: "DHCP",
    69: "TFTP",
    80: "HTTP",
    110: "POP3",
    111: "rpcbind",
    123: "NTP",
    135: "MSRPC",
    137: "NetBIOS name",
    139: "NetBIOS session",
    143: "IMAP",
    161: "SNMP",
    179: "BGP",
    389: "LDAP",
    443: "HTTPS",
    445: "Microsoft-DS",
    465: "SMTPS",
    502: "Modbus",
    514: "syslog",
    587: "SMTP submission",
    623: "IPMI",
    636: "LDAPS",
    873: "rsync",
    993: "IMAPS",
    995: "POP3S",
    1080: "SOCKS",
    1194: "OpenVPN",
    1433: "MSSQL",
    1521: "Oracle DB",
    1723: "PPTP",
    1883: "MQTT",
    2049: "NFS",
    2082: "cPanel",
    2375: "Docker",
    2376: "Docker TLS",
    2525: "SMTP alternate",
    3000: "Dev server",
    3306: "MySQL",
    3389: "RDP",
    4444: "Metasploit",
    5000: "Dev server",
    5432: "PostgreSQL",
    5601: "Kibana",
    5672: "AMQP",
    5900: "VNC",
    5901: "VNC display 1",
    5984: "CouchDB",
    5985: "WinRM",
    5986: "WinRM HTTPS",
    6379: "Redis",
    6443: "Kubernetes API",
    7001: "WebLogic",
    8000: "HTTP alternate",
    8008: "HTTP alternate",
    8080: "HTTP proxy",
    8086: "InfluxDB",
    8443: "HTTPS alternate",
    8888: "HTTP alternate",
    9000: "PHP-FPM",
    9042: "Cassandra",
    9092: "Kafka",
    9200: "Elasticsearch",
    9300: "Elasticsearch transport",
    11211: "Memcached",
    15672: "RabbitMQ management",
    25565: "Minecraft",
    27017: "MongoDB",
    27018: "MongoDB shard",
    50000: "SAP",
};

export function serviceName(port: number): string | null {
    return SERVICES[port] ?? null;
}

/**
 * The ports Nmap reports as the most-scanned on the internet, in order.
 *
 * This is the default because it is the list somebody means when they say
 * "check the common ports", and because 23 ports is a scan a stranger's host
 * barely notices.
 */
const TOP_PORTS = [
    20, 21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 502, 587, 993, 995, 1723, 2525,
    3306, 3389, 5900, 8080,
] as const;

const WEB_PORTS = [80, 443, 3000, 5000, 8000, 8008, 8080, 8443, 8888] as const;

const MAIL_PORTS = [25, 110, 143, 465, 587, 993, 995, 2525] as const;

/**
 * The ports that most often turn out to be a database facing the internet by
 * accident. This is the preset an operator runs against their own host and
 * hopes to see nothing in.
 */
const DATABASE_PORTS = [
    1433, 1521, 3306, 5432, 5984, 6379, 9042, 9092, 9200, 11211, 27017,
] as const;

const REMOTE_PORTS = [22, 23, 1723, 3389, 5900, 5901, 5985, 5986] as const;

/**
 * There is deliberately no "known attack ports" preset.
 *
 * A list of backdoor and trojan ports has a real defensive use — checking your
 * own host — and, pointed at an address somebody typed, it is a preset for
 * finding compromised machines belonging to other people. The defensive half is
 * already served: type the numbers into the custom field, which is a thing you
 * do to a host you know.
 */
export const PRESET_PORTS: Readonly<Record<Exclude<PortPreset, "custom">, readonly number[]>> = {
    top: TOP_PORTS,
    web: WEB_PORTS,
    mail: MAIL_PORTS,
    database: DATABASE_PORTS,
    remote: REMOTE_PORTS,
};

export function presetPorts(preset: PortPreset): readonly number[] {
    return preset === "custom" ? [] : PRESET_PORTS[preset];
}
