/**
 * The passphrase wordlist.
 *
 * Exactly 1024 words, which is the whole point of the number: a word drawn
 * uniformly from it carries exactly 10 bits, so six words is exactly 60 bits and
 * the entropy read-out needs no rounding to explain. Entropy is still computed
 * from `PASSPHRASE_WORDS.length` rather than a hardcoded 10 — if the list ever
 * changes size, the arithmetic follows it.
 *
 * Every word is lowercase ASCII, three to eight letters, and common enough to
 * spell from memory after reading it once. That is the entire job: a passphrase
 * a person cannot retype is a passphrase they will replace with something worse.
 *
 * Held as whitespace-separated text rather than an array literal so the source
 * stays readable and diffs stay small. `tests/wordlist.test.ts` holds the
 * invariants — count, uniqueness, length bounds, alphabet.
 */
const RAW_WORDS = `
able about above accent accept access acorn across action actor adapt admit adopt adult advice afford
afraid after again agency agent agile agree ahead aisle alarm album alert alien alive alley almond
almost alone along alpha alter always amber amount amuse anchor angel anger angle animal ankle answer
apple apply apron arch area arena argue armor army aroma around arrow
bacon badge bagel baker balance balcony ballad ballot bamboo banana bandit banjo banker banner barber barley
barn barrel basil basin basket batch beach beacon beam bean bear beard beast beaver become beetle
before begin behave behind belief bell belong below bench bend benefit berry beside best better beyond
bicycle bike bill binary birch bird birth biscuit bishop bison bitter black blade blame blank blast
blaze blend bless blind blink block blond blood
cabin cable cactus cage cake calm camel camera camp canal candle candy cannon canoe canvas canyon
capital captain carbon card cargo carpet carrot carry cart carve case cash casino castle catch cattle
cause cave cedar cell cement center century cereal chain chair chalk chamber change chapel charge charm
chart chase cheap check cheer cheese chef cherry chess chest chicken chief child chimney chip choice
choose chorus cider cinema circle circus city civil claim clarity classic clean clear clever cliff climb
clinic clock cloth cloud clover club coast coffee coin color copper coral cotton count cover cream
dairy daisy damage dance danger daring dark dash data date dawn deal debate debris decade decide
deck declare decor deep deer defeat defend define degree delay delight deliver demand denim dense dentist
deny depart depend deposit depth derby desert design desire desk detail detect develop device devote diagram
dial diamond diary dice diet digest digital dignity
eager eagle early earn earth ease east easy echo eclipse edge edit editor effect effort eight
either elbow elder elect element elite ember embrace emerald emotion employ empty energy engine
fabric face fact factor fade fail faint fair fairy faith falcon fall false fame family famous
fancy farm fashion fast fate father fatigue fault favor fear feast feather feature feed feel fellow
female fence fern ferry fetch fever fiber fiction field fierce fifteen figure file fill film filter
final finance finger finish fire firm first fish
gadget galaxy gallery game garage garden garlic garment gate gather gauge gaze gear general gentle genuine
ghost giant gift giraffe girl give glad glance glass glide globe glory glove glow
habit hair half hall hammer hand handle happy harbor hard harm harmony harvest hatch haul hawk
hazel head heal health hear heart heat heaven heavy hedge heel height helmet help herb herd
hero hidden
icon idea ideal idle image impact import impose improve impulse inch include income indeed index indoor
infant inform inhale injury ink inner
jacket jade jaguar jail jam jar jaw jazz jelly jet jewel join joke journal
kayak keen keep kettle key kick kind king kiss kitchen kite kitten knee knife
label labor lace ladder lady lake lamb lamp land lane language lantern laptop large laser last
late laugh launch laundry lava law lawn layer lazy lead leaf league lean learn lease least
leather legend
machine magic magnet mail main major make mammal manage mango manner mansion manual map marble march
margin marine mark market marry mask mass master match matrix matter mature mayor meadow meal mean
measure meat medal media medium meet melody melon melt member memory mentor menu mercy merge merit
mesh message metal method
nail name napkin narrow nation native nature navy near neat neck need needle nephew nerve nest
network neutral news night
oasis oat obey object oblige observe obtain occur ocean octopus offer office often oil olive onion
online open opera opinion option orange orbit orchard
pace pack page paint pair palace pale palm panda panel panic paper parade parcel parent park
parrot part party pass past pasta patch path patient patrol pattern pause pave paw peace peach
peak peanut pear pearl pebble pedal pen pencil people pepper perch perfect perform perfume period permit
person pet phase phone photo phrase piano pick picnic picture piece pigeon pile pilot pine pink
pint pioneer pipe pitch pizza place plain plane planet plank plant plastic plate play plaza please
quality quarter queen quest quick quiet quilt quote
rabbit race radar radio raft rail rain raise rally ranch random range rank rapid rare rate
rather ratio raven reach read ready real reason rebel recall receive recipe record recover reduce reflect
refuse regard region regret reject relax release relief remain remark remedy remind remote remove render renew
rent repair repeat reply
sacred saddle safe sail saint salad salmon salon salt same sample sand satin sauce sausage save
scale scan scarf scene scent school science scope score scout scrap screen script sea seal search
season seat second secret section secure seed seek segment select self sell senior sense series serve
settle seven shadow shaft shake shallow shape share sharp shave shed sheep sheet shelf shell shield
shift shine ship shirt shock shoe shoot shop short shout show shrimp shrink shuttle sibling side
siege sight sign silent silk silver similar simple since sing single sink sister site six size
skate sketch ski skill skin skirt skull sky slate sleep sleeve slice slide slight
table tackle tail tailor take tale talent talk tall tank tape target task taste tea teach
team tear tell temple tenant tender tennis tent term test text thank theme theory there thick
thin thing think third thirty thorn thread three thrive throat throw thumb thunder ticket tide tidy
tiger tight tile timber time tiny tip tired tissue title toast today toe together token tomato
uncle under unfold unify union unique unit unite unlock until upper urban urge usage useful usual
vacant vacuum valid valley value valve van vanilla vapor variety various vast vault vector velvet vendor
venture verify verse vessel veteran victory video view
wage wagon waist wait wake walk wall walnut wander want warm warn wash wasp waste watch
water wave wax weak wealth weapon wear weather weave web wedding weekend weigh welcome well west
whale wheat wheel where which while whisper white
yard year yeast yellow yield yoga young youth
zebra zero zigzag zinc zip zone zoo zoom
`;

export const PASSPHRASE_WORDS: readonly string[] = RAW_WORDS.trim().split(/\s+/);
