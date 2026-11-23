# Hướng dẫn người chơi — Tiên Giới

> Tài liệu này viết cho **người chơi**, không phải cho người phát triển. Mọi con số đều lấy từ dữ liệu thật của trò chơi (không bịa). Nếu thấy số nào sai so với bản trong game, đó là lỗi tài liệu — báo lại để sửa.

Tiên Giới là một game tu tiên 2D, chiến đấu thời gian thực, chơi trên trình duyệt. Bạn bắt đầu là một phàm nhân tới Lạc Hà Trấn, luyện khí thành tiên, dần vượt qua các cảnh giới, săn yêu thú và trùm, lập tông môn, và nếu tử trận trước yêu thú thì đầu thai luân hồi mang theo duyên phận.

Mục lục:

- [Bắt đầu và điều khiển](#bắt-đầu-và-điều-khiển)
- [Chiến đấu: đánh, chiêu, ô chiêu](#chiến-đấu-đánh-chiêu-ô-chiêu)
- [Cảnh giới và thanh tu vi](#cảnh-giới-và-thanh-tu-vi)
- [Túi đồ, trang bị, đan dược](#túi-đồ-trang-bị-đan-dược)
- [Nhiệm vụ](#nhiệm-vụ)
- [Cửa hàng, rèn, đổi đồ](#cửa-hàng-rèn-đổi-đồ)
- [Tổ đội](#tổ-đội)
- [Bí cảnh](#bí-cảnh)
- [Trùm nhiều chiêu: học né](#trùm-nhiều-chiêu-học-né)
- [Gặp chặn đường (đang thử nghiệm)](#gặp-chặn-đường-đang-thử-nghiệm)
- [Luân hồi và Hoàng Tuyền](#luân-hồi-và-hoàng-tuyền)
- [PK thách đấu](#pk-thách-đấu)
- [Tông môn](#tông-môn)
- [Xã hội: xếp hạng, thành tựu, trùm thế giới](#xã-hội-xếp-hạng-thành-tựu-trùm-thế-giới)
- [Phụ lục: quái theo bậc và bản đồ](#phụ-lục-quái-theo-bậc-và-bản-đồ)

---

## Bắt đầu và điều khiển

Bạn điều khiển nhân vật bằng bàn phím. Mặc định:

| Hành động | Phím |
| --- | --- |
| Di chuyển | **W A S D** hoặc **← ↑ ↓ →** |
| Kiếm chém (đánh thường) | **J** (hoặc **Cách**) |
| Kiếm khí ( chiêu tầm xa) | **K** (hoặc phím **3**) |
| Ô chiêu thức 2 / 3 / 4 / 5 | **L / U / I / O** |
| Đả tọa (ngồi thiền) | **Z** (hoặc phím **4**) |
| Đột phá cảnh giới | **V** |
| Uống đan dược ô 1 / ô 2 | **1 / 2** |
| Nhặt đồ / nói chuyện / qua cổng | **F** |
| Chọn mục tiêu / mục tiêu kế | **Tab** (hoặc **T**) |
| Mục tiêu trước | **Shift + Tab** |
| Đổi chế độ nhắm (tự động / thủ công) | **`** (phím dấu ngã) |
| Menu đồng đạo gần nhất (mời đội / thách đấu / mời tông môn) | **P** |
| Nhận lời mời / đồng ý | **Y** |
| Từ chối lời mời / huỷ xác nhận | **X** |
| Rời bí cảnh / đầu hàng quyết đấu | **R** |
| Túi đồ | **B** |
| Nhân vật và trang bị | **C** |
| Sổ nhiệm vụ | **N** (hoặc **Q**) |
| Tông môn | **G** |
| Công pháp (gắn / gỡ chiêu vào ô) | **Shift + K** |
| Xã hội (xếp hạng, thành tựu, sự kiện) | **Shift + G** |
| Bản đồ lớn | **M** |
| Bật / tắt bản đồ nhỏ | **Shift + M** |
| Cài đặt và phím tắt | **E** |
| Mở ô chat | **Enter** |
| Bật / tắt âm thanh | **0** |
| Ẩn / hiện giao diện | **H** |
| Đóng bảng / bỏ chọn / thoát ô chat | **Esc** |

Khi nói chuyện với NPC, bấm **1 – 9** để chọn dòng trả lời. Mọi phím đều đổi được ở màn **Cài đặt và phím tắt (E)**; chỉ có **Esc** là cố định.

**Cảnh bản đồ kiểu mới:** bốn bản đồ được vẽ lại bằng hình pixel art (đất, cỏ, cây, nước, đường). Hình mới bật sẵn; nếu máy yếu hoặc thấy giật, tắt ô **"Cảnh bản đồ kiểu mới"** ở Cài đặt (E), cảnh đổi về kiểu cũ ngay, không cần tải lại. Chỉ là hình ảnh: đường đi, va chạm, vùng quái và cổng không đổi.

> **Mẹo:** Tay trái giữ **WASD** di chuyển, tay phải dùng cụm **J K L U I O** để đánh và ra chiêu — đừng bỏ tay khỏi vị trí này khi giao chiến.

Chi tiết thiết kế bàn phím: [docs/THIET_KE_BAN_PHIM.md](THIET_KE_BAN_PHIM.md).

---

## Chiến đấu: đánh, chiêu, ô chiêu

Trò chơi có hai đòn mặc định và các ô chiêu thức bạn tự gắn:

- **Kiếm chém** (J): đòn cận chiến nhanh, không tốn linh lực. Dùng để xử lý quái yếu và duy trì áp lực.
- **Kiếm khí** (K): nhát kiếm tầm xa, mạnh hơn, tốn linh lực và có thời gian hồi chiêu. Dùng để đánh từ xa hoặc bổ sung sát thương.
- **Ô chiêu thức 2–5** (L / U / I / O): bốn ô bạn gắn chiêu đã học. Mở bảng **Công pháp (Shift + K)** để gắn hoặc gỡ chiêu vào ô. Ô còn trống thì bấm sẽ báo lý do, không làm gì.

### Hệ (ngũ hành) và tương khắc

Chiêu và yêu thú mang một trong mười hệ: **Kim, Mộc, Thủy, Hỏa, Thổ, Băng, Phong, Lôi, Âm, Vô sắc**. Tương khắc theo ngũ hành:

**Kim → Mộc → Thổ → Thủy → Hỏa → Kim** (mũi tên chỉ chiều "khắc").

- Đánh trúng quái **bị** hệ mình khắc: sát thương **x1,3**.
- Đánh trúng quái **khắc** hệ mình: sát thương **x0,8**.
- Cùng hệ hoặc Vô sắc: không nhân thêm.

> **Mẹo:** Trước khi đánh một con quái, nhìn hệ của nó mà chọn chiêu khắc. Một đòn khắc hệ có thể rút nửa thanh máu nhanh hơn nhiều so với đòn thường.

### Trạng thái

Chiêu có thể gắn các trạng thái: **Bỏng, Độc, Chảy máu** (sát thương theo thời gian), **Tê cóng** (chậm), **Vỡ giáp** (nhận thêm sát thương), **Choáng** (không làm gì được), và các buff **Hộ thể, Tăng tốc, Hồi phục**. Mỗi mục tiêu tối đa 4 trạng thái; cùng loại thì làm mới, không cộng dồn. Một số bộ phù và phù tốc chiêu có thể tăng sát thương chiêu hoặc giảm hồi chiêu.

### Hình đòn của chiêu

Bảng **Công pháp (Shift + K)** ghi **kiểu đánh** của từng chiêu. Ngoài các hình quen thuộc (**quạt trước mặt, tia thẳng, toả nhiều tia, vòng nổ quanh mình, vùng đặt xuống đất, lao tới né đòn, hộ thể quanh mình**), bản 0.5.0 thêm sáu hình mới:

| Hình | Cách hoạt động |
|---|---|
| **Sét lan** | Đánh trúng một mục tiêu rồi nhảy sang mục tiêu gần đó. |
| **Đạn bay** | Bắn một hoặc nhiều viên bay thẳng; có viên xuyên qua kẻ địch, có viên nảy. |
| **Vùng duy trì** | Đặt một vùng dưới đất, tác dụng theo nhịp lên những gì đứng trong đó cho tới khi tan. |
| **Bẫy** | Đặt xuống đất, nằm im; quái bước vào thì bẫy mới kích hoạt. |
| **Hào quang quanh thân** | Bám theo bạn và tác dụng theo nhịp quanh bạn. |
| **Tượng triệu hồi** | Dựng một bức tượng đứng yên, tác dụng theo nhịp quanh nó. |

Vùng, bẫy, hào quang và tượng gọi chung là **vật thể bền**; chúng tan sau một thời gian. Giới hạn: mỗi người tối đa **3 vùng, 3 bẫy, 1 hào quang, 2 tượng** và **4 vật thể cùng lúc**; đặt thêm thì vật thể **cũ nhất** tan trước. Vật thể bền **không đặt được trong khu an toàn** (trấn) và tan khi chủ chết, rời phòng, qua cổng hoặc vào bí cảnh.

> **Ví dụ:** Phi Kiếm Tam Liên (đạn bay, ba viên hình quạt hẹp), Độc Đằng Phục (bẫy), Liệt Diễm Trận (vùng), Liên Châu Lôi (sét lan), Hồn Phiên Tượng (tượng).

### Chiêu vận

Một số chiêu phải **vận khí** một lúc rồi mới đáp (ví dụ **Phá Sơn Nhất Kích**, vận 1,2 giây). Khi đang vận:

- Linh lực bị trừ và hồi chiêu bắt đầu tính **ngay lúc bắt đầu vận**; có vòng tụ khí quanh người để mọi người thấy.
- Bạn đi **chậm một nửa** và **không dùng được chiêu khác**.
- Chiêu đáp ở **vị trí bạn đang đứng lúc đáp**, theo hướng lúc bắt đầu vận.
- Vận bị **huỷ, không đáp và không hoàn linh lực** nếu bạn bị **choáng**, **ngã xuống**, hồn lìa xác, vào Hoàng Tuyền, hoặc có một trận **thách đấu bắt đầu** trong lúc vận. Vì vậy hãy vận khi quái chưa kịp áp sát.

### Phẩm, tầng và luyện chiêu

Mỗi chiêu có **phẩm cấp**: **Hoàng, Huyền, Địa, Thiên** (từ thấp tới cao). Phẩm quyết định **tầng tối đa** của chiêu:

| Phẩm | Hoàng | Huyền | Địa | Thiên |
|---|---|---|---|---|
| Tầng tối đa | 3 | 4 | 5 | 6 |

**18 chiêu cũ** (có từ trước đợt chiêu mới) chưa khai phẩm riêng nên **luôn tối đa tầng 3**, dù bảng Công pháp có thể hiện phẩm suy từ độ hiếm của kinh quyển; tầng 4-6 chỉ dành cho chiêu mới có phẩm Huyền, Địa hoặc Thiên.

Có hai cách lên tầng:

- **Đọc thêm kinh quyển trùng** (nhặt được khi hạ quái, bán và mua được): mỗi quyển trùng nâng một tầng, tới tầng tối đa.
- **Luyện chiêu:** mỗi lần dùng chiêu **trúng ít nhất một mục tiêu** được **1 điểm luyện** (tối đa **60 điểm mỗi phút**, nên đứng đánh bù nhìn không cày nhanh được). Đủ điểm thì chiêu tự lên tầng: tầng 1 lên 2 cần **60** điểm, tầng 2 lên 3 cần **150**, tầng 3 lên 4 cần **300**, tầng 4 lên 5 cần **600**. Luyện chỉ đưa chiêu tới **tầng tối đa trừ một**; **tầng cuối chỉ có bằng kinh quyển trùng**. Bảng Công pháp có thanh luyện và chấm tầng cho từng chiêu.

Tầng cao hơn thì sát thương mạnh hơn và hồi chiêu ngắn hơn. Lên tầng bằng kinh quyển thì **điểm luyện dở dang của tầng cũ mất** (luyện lại từ 0 ở tầng mới). Khi luân hồi, chiêu của kiếp cũ mất theo kiếp; chỉ chiêu đã **khắc vào chân linh** trở lại, ở **tầng 1** và với điểm luyện trắng.

---

## Cảnh giới và thanh tu vi

Thang cảnh giới (từ thấp đến cao):

| Cảnh giới | Các bậc nhỏ |
| --- | --- |
| Phàm Nhân | (đầu vào) |
| Luyện Khí | Tầng 1 → Tầng 9 |
| Trúc Cơ | Sơ kỳ – Trung kỳ – Hậu kỳ |
| Kim Đan | Sơ kỳ – Trung kỳ – Hậu kỳ |
| Nguyên Anh | Sơ kỳ – Trung kỳ – Hậu kỳ |
| Hóa Thần | Sơ – Trung – Hậu kỳ |
| Luyện Hư | Sơ – Trung – Hậu kỳ |
| Hợp Thể | Sơ – Trung – Hậu kỳ |
| Đại Thừa | Sơ – Trung – Hậu kỳ |
| Độ Kiếp | Sơ – Trung – Hậu kỳ |

Hiện tại nội dung chơi được (bản đồ, quái, nhiệm vụ, chiêu) đi tới **Nguyên Anh**. Các cảnh giới từ **Hóa Thần** trở đi đã có tên trong thang nhưng chưa có nội dung — đừng vội lo, đó là đường phía trước.

### Thanh tu vi

Bạn tích **tu vi** để lên bậc. Thanh đầy thì tới bước **Đột phá**. Thời gian tu vi cần tăng dần rất nhanh theo cảnh giới:

| Cảnh giới | Tu vi bậc đầu | Thời gian cày ước tính (solo) |
| --- | --- | --- |
| Luyện Khí (đủ 9 tầng) | 280 / tầng | ~53 phút hết Luyện Khí |
| Trúc Cơ | 4.400 – 5.819 | ~2 giờ 52 phút |
| Kim Đan | 48.000 – 63.480 | ~5,7 giờ |

(Phàm Nhân chỉ cần 40 tu vi để vào Luyện Khí.) Số liệu cân bằng đầy đủ ở [docs/CAN_BANG.md](CAN_BANG.md).

### Đả tọa (ngồi thiền)

Bấm **Z** để đả tọa: khí huyết và linh lực hồi nhanh, đồng thời tu vi tự tăng. **Động thân (bất kỳ hành động nào) sẽ gián đoạn, phải ngồi lại từ đầu.** Đả tọa chậm hơn săn quái cùng cấp — dùng nó để nghỉ, hồi phục và cày tu vi khi không có quái.

### Đột phá cảnh giới lớn

Khi ở **tầng cuối** của một cảnh giới và thanh tu vi **đầy**, bấm **V** để thử đột phá lên cảnh giới kế. Đột phá **có thể thất bại**: thất bại mất **30% tu vi** đã tích, nhưng không mất cảnh giới. Xác suất thành công giảm dần theo cảnh giới (xấp xỉ):

| Từ → tới | Xác suất thành công (không có hỗ trợ) |
| --- | --- |
| Phàm Nhân → Luyện Khí | ~85% |
| Luyện Khí → Trúc Cơ | ~77% |
| Trúc Cơ → Kim Đan | ~69% |
| Kim Đan → Nguyên Anh | ~61% |

Dùng **đan hộ đạo** trước khi đột phá sẽ cộng thêm phần trăm (tối đa lên ~95%).

> **Mẹo:** Đừng đột phá khi thanh chưa đầy hoặc khi đang bị thương. Mang đủ đan hồi máu và chọn nơi an toàn (trong trấn / gần cổng) để thử — nếu thất bại bạn vẫn còn cảnh giới, chỉ mất một phần tu vi.

---

## Túi đồ, trang bị, đan dược

### Túi đồ

- Túi đồ có **24 ô**.
- Đi gần đồ rơi trong bán kính nhỏ thì **F** để nhặt; đồ rơi tự biến sau **90 giây**, nên nhặt nhanh.
- **Vứt đồ:** chọn ô rồi bấm **Vứt 1** hoặc **Vứt hết**; luôn có hộp xác nhận ghi rõ tên món và số lượng, và nút được chọn sẵn là **Giữ lại** (lỡ bấm Enter cũng không vứt). Khi ô có từ **2 cái** trở lên, hộp có **ô nhập số lượng** để vứt đúng số bạn muốn (gõ số, **− / +**, **×10 / ×100**, **Tối đa**); số trống hoặc sai thì **không vứt** và hộp vẫn mở. Từ **Bảo phẩm** trở lên hộp có thêm dòng nhắc "Đồ quý". Đồ vứt rơi xuống chân bạn, **ai cũng nhặt được ngay** và tự biến sau 90 giây như đồ rơi khác.

### Trang bị (6 ô)

| Ô | Công khai? | Mở từ |
| --- | --- | --- |
| Vũ khí | Có | Đầu game |
| Áo bào | Có | Đầu game |
| Hộ phù | Có | Đầu game |
| Hài | Riêng chủ | Đầu game |
| Ngọc bội | Riêng chủ | Đầu game |
| Pháp bảo | Riêng chủ | **Kim Đan** |

Ba ô đầu (Vũ khí, Áo bào, Hộ phù) ảnh hưởng ngoại hình và hiển thị công khai. Ba ô sau (Hài, Ngọc bội, Pháp bảo) là riêng của bạn; **Pháp bảo** chỉ mở từ cảnh giới Kim Đan. Đồ có 5 bậc hiếm: **Phàm phẩm, Linh phẩm, Bảo phẩm, Tiên phẩm, Thần phẩm** (càng cao càng mạnh).

### Đan dược

- **Hồi máu:** Hồi Huyết Đan (hồi 40%), Đại Hồi Huyết Đan (70%), Thượng Hồi Huyết Đan (90%).
- **Hồi linh lực:** Hồi Linh Đan (50%), Đại Hồi Linh Đan (70%), Thượng Hồi Linh Đan (90%).
- **Tăng tu vi / hỗ trợ đột phá:** Tụ Khí Đan (tăng nhẹ thanh tu vi), Đột Phá Đan (đỉnh Luyện Khí), Kinh Chỉ Đan (đỉnh Trúc Cơ), Dưỡng Anh Đan (đỉnh Kim Đan, hiệu lực có hạn).

> **Mẹo:** Luôn mang theo đan hồi máu khi ra khỏi trấn. Với quái mạnh (Hắc Hổ, Độc Thiềm, các trùm), uống đan **trước khi** khí huyết xuống nửa thay vì để kiệt rồi mới uống.

---

## Nhiệm vụ

Trên đầu NPC (và trên bản đồ) có hai dấu: **!** là NPC có nhiệm vụ mới để bạn **nhận**; **?** màu **vàng**, to hơn, là NPC đang chờ bạn **trả nhiệm vụ** (bạn đã làm đủ mục tiêu). Sổ nhiệm vụ mở bằng **N**.

- **Chuỗi chính** dẫn bạn từ Phàm Nhân qua Luyện Khí, Trúc Cơ, Kim Đan tới Nguyên Anh, mỗi chặng ở một vùng đất mới (Lạc Hà Trấn → Hắc Phong Cốc → Âm Sương Trạch → Hàn Vân Lĩnh). Chuỗi dạy lần lượt: đánh quái, nhặt đồ, đột phá, đả tọa, đổi đồ, dùng đan.
- **Việc phụ** (không bắt buộc): thường là hạ một con trùm (Xích Mãng, Hắc Giao…) — **nên đi theo đội**.
- **Nhiệm vụ hằng ngày** ở Bảng cáo thị: làm lặp lại mỗi ngày để có thêm phần thưởng.

Các bước nhiệm vụ gồm: hạ quái, thu thập vật phẩm, nói chuyện với NPC, hoặc đạt cảnh giới. Thưởng là tu vi và đan dược (đôi khi có Linh thạch hoặc kinh quyển). Thưởng tu vi của nhiệm vụ chính và việc phụ chỉ nhận **một lần**; mỗi nhiệm vụ chính cho khoảng 5 % thanh tu vi của bậc nhận trở lên, mỗi việc phụ khoảng 2 % trở lên.

### Nhận, làm, rồi quay về TRẢ

Thưởng chỉ tới khi bạn **trả** nhiệm vụ, không phải lúc vừa làm xong mục tiêu:

1. **Nhận:** ở NPC giao nhiệm vụ, ngay dưới dòng "Nhận nhiệm vụ" có dòng **Thưởng (gốc)** cho biết sẽ được gì. Số tu vi thật có thể nhiều hơn số gốc nếu bạn có buff tông môn.
2. **Làm đủ mục tiêu:** thẻ theo dõi và sổ nhiệm vụ đổi sang **"ĐÃ ĐỦ — về gặp (tên NPC) ở (bản đồ) để trả nhiệm vụ"**, game báo một lần, và NPC đó hiện dấu **?** vàng. Nếu đã đủ mục tiêu mà lỡ vứt, bán hay dùng mất vật phẩm thu thập thì thẻ ghi "Cần đủ (vật phẩm): có / cần để trả nhiệm vụ" cho tới khi bạn có đủ lại.
3. **Trả:** về gặp NPC giao, chọn **Trả nhiệm vụ: (tên)**. Một bảng **"Hoàn thành: (tên)"** hiện ra, liệt kê đúng những gì bạn vừa nhận: **+N tu vi** (số thật, đã nhân buff tông môn nếu có), từng vật phẩm kèm số lượng, và Linh thạch nếu có. Bảng ở lại vài giây, không chặn thao tác.

- **Túi đồ đầy** thì chưa nhận được thưởng và nhiệm vụ vẫn còn nguyên: dọn bớt túi rồi trả lại.
- Tu vi đã đầy ở bậc cuối của cảnh giới thì bảng ghi "Tu vi đã đầy: cần Đột phá để tích luỹ tiếp" (xem [Đột phá cảnh giới lớn](#đột-phá-cảnh-giới-lớn)).

> **Mẹo:** Làm chuỗi chính song song với việc hằng ngày — vừa có định hướng vừa cày thêm tu vi và Linh thạch.

---

## Cửa hàng, rèn, đổi đồ

Có ba trạm chế tạo:

- **Lò Rèn** — rèn đồ.
- **Lò Đan** — luyện đan.
- **Bàn Phù** — chế phù.

**Cửa hàng** (NPC bán hàng) hiện chỉ bán **đan hồi phục và kinh quyển chiêu cơ bản**, giá mua gấp đôi, bán lại được 50% giá trị. Cửa hàng **cố ý không bán** Tụ Khí Đan và trang bị — những thứ đó bạn tự luyện hoặc kiếm từ quái. Tiền tệ là **Linh thạch** (tối đa ~1 tỷ), kiếm được từ rơi đồ và bán vật phẩm.

> **Mẹo:** Đừng bán đồ ngay — tích nguyên liệu để luyện đan và chế phù sẽ tiết kiệm hơn nhiều so với mua lại.

---

## Tổ đội

- Đội tối đa **4 người** (kể cả đội trưởng).
- Mỗi thành viên có mặt ngoài người đầu cộng **+15% tổng tu vi** của đội, rồi chia đều — nên đánh đội vẫn nhanh hơn đánh một mình.
- Chỉ người đứng gần chỗ quái chết (trong tầm chia) mới được nhận tu vi.
- Mời bằng cách mở **menu đồng đạo (P)** → mời, hoặc bấm nhận lời mời khi có người rủ. Lời mời hết hạn sau 30 giây.

> **Mẹo:** Với trùm (Xích Mãng, Hắc Giao, Thiên Hàn Vương…), đội 3–4 người là gần như bắt buộc. Phân công một hai người chịu đòn, người còn lại đánh từ xa.

---

## Bí cảnh

Chỉ có một bí cảnh hiện nay: **Linh Hư Bí Cảnh**.

- Vào qua **Thủ môn ở Lạc Hà Trấn**, cần đội **2–4 người**.
- Mở cho người từ **Luyện Khí Tầng 9** đến **Trúc Cơ Hậu kỳ**.
- Mỗi lượt giới hạn **12 phút**; hôm nay nhận thưởng hoàn thành tối đa **3 lượt**.
- Trong trận: một trùm và nhiều quái con. Hoàn thành cho Linh thạch và đan dược, đồ rơi nhặt trong 60 giây.
- **Gục trong bí cảnh KHÔNG mất kiếp:** bạn hồi về cổng sau vài giây với 30% máu và mất một lượt thưởng trong ngày. Chết do quái ở bản đồ thường, hoặc thua trong đấu trường của Gặp chặn đường, mới vào Hoàng Tuyền (xem bên dưới).

> **Mẹo:** Bí cảnh là "bao máu" — trận dài, sát thương nhẹ nhưng liên tục. Mang đủ đan và đánh đều, đừng tham đuổi quái xa khỏi đội.

Chi tiết thiết kế: [docs/THIET_KE_BI_CANH.md](THIET_KE_BI_CANH.md).

---

## Trùm nhiều chiêu: học né

Từ bản 0.4.0, bốn con trùm (**Xích Mãng**, **Hắc Giao**, **Thiên Hàn Vương**, **Linh Hư Yêu Vương** ở bí cảnh) không còn chỉ đứng đánh: mỗi con có **bộ chiêu** riêng, đổi chiêu theo thanh máu. Chết do trùm ở bản đồ thường vẫn là **mất một kiếp**, nên đây là phần cần học kỹ.

### Đọc vùng cảnh báo

- Trước MỌI đòn có sát thương, trên đất hiện **vùng cảnh báo** (có viền, nền mờ, vòng thời gian co lại). Thời gian báo trước **ít nhất 0,8 giây**: bước ra khỏi vùng trước khi đòn đáp là **không bị trúng**. Cuồng nộ cũng không rút ngắn thời gian báo trước.
- Hình vùng cho biết cách né:
  - **Vòng tròn** (đập đất, đòn nhắm vào người): bước ra ngoài vòng.
  - **Nón** (quất đuôi): bước sang **bên**, đừng lùi thẳng ra sau.
  - **Đường** (sóng nước, lao tới): bước **ngang**, không chạy dọc theo đường.
  - **Vành khuyên** (vòng nổ, hàn khí): **lỗ ở giữa** vành và **phía ngoài rìa** đều an toàn; dải vành nằm giữa hai vòng mới là trúng. Chạy vào lỗ giữa hoặc ra ngoài rìa, đứng gần cái nào hơn thì chạy về cái đó.
  - **Mưa**: nhiều vòng rơi **lần lượt**, mỗi vòng có báo trước riêng; di chuyển liên tục, đừng đứng một chỗ.
  - **Vũng**: để lại vũng gây sát thương mỗi giây (có thể kèm độc hoặc tê cóng); đừng đứng lại trong vũng.
  - **Vực xoáy**: kéo bạn vào giữa rồi nổ; chạy ra khỏi tầm nổ ngay sau khi bị kéo.
- Trên thanh máu trùm (đầu màn hình) có **tên chiêu đang vận**, **vạch giai đoạn** và, khi có, **chỉ báo cuồng nộ**. Đang vận chiêu thì trùm đứng yên một nhịp: đó là lúc đánh trả.
- Mạng chậm không sao: màn hình tự rút ngắn vòng đếm theo độ trễ của bạn để vòng đầy đúng lúc bạn còn né kịp (mạng quá chậm trên khoảng 190 ms vẫn thiệt thòi, hãy chơi gần đường truyền tốt).

### Bốn trùm

| Trùm | Chiêu chính | Khi máu xuống thấp |
| --- | --- | --- |
| **Xích Mãng** (Trúc Cơ, nên đi đội) | Quất đuôi (nón), Phun độc bủa vũng, Cuộn mình lao tới | Dưới 50% máu: gọi hai **Rắn Con**, nhanh hơn |
| **Hắc Giao** (Kim Đan, đội 3-4) | Sóng nước (đường), Vực xoáy (kéo rồi nổ), **Vảy giáp** (giảm 40% sát thương nhận trong 4 giây: có vầng giáp thấy được, đợi hết giáp rồi dồn sát thương) | Dưới 40% máu: cuồng nộ nhẹ (đánh mạnh hơn, ra chiêu dày hơn) |
| **Thiên Hàn Vương** (Nguyên Anh, đội 3-4) | Đập đất, Hàn long lao tới, **Mưa băng**, Vùng băng giá (làm chậm) | Dưới 50%: **hàn khí** quanh thân gây tê cóng; dưới 25%: triệu hai **Hàn Lang** |
| **Linh Hư Yêu Vương** (bí cảnh) | Vòng nổ yêu khí, Truy kích kẻ đứng **xa nhất**, Dịch chuyển chớp | Dưới 70%: dịch chuyển chớp; dưới 35%: **phân thân**; sau **5 phút**: cuồng nộ (đòn nặng hơn, nhanh hơn) |

- **Quái con** do trùm gọi (Rắn Con, Hàn Lang, phân thân) **không rơi đồ, không cho tu vi**: hạ chúng để bớt sát thương, đừng cày chúng.
- **Linh Hư Yêu Vương** đánh nhẹ nhưng trận dài: đội 4 người vẫn hạ được khi trúng vài đòn; đội 3 người nên **né** gần như mọi đòn. Mang đủ đan hồi máu.
- Thứ tự an toàn: **quan sát vùng, bước ra, rồi đánh**. Đừng tham thêm một đòn trong lúc vùng đã hiện.

> **Mẹo:** Cả đội đứng sát nhau thì một vòng tròn trúng cả đội. Chia nhau ra vừa phải: một người chịu mục tiêu của trùm, người còn lại đứng nghiêng ra ngoài vùng của đòn quét.

---

## Gặp chặn đường (đang thử nghiệm)

> **Tính năng này chỉ có khi máy chủ bật.** Hiện nó **TẮT** ở bản chạy thật cho tới khi nghiệm thu xong (xem `docs/THIET_KE_CHAN_DUONG.md`). Khi bật, nó chỉ chạy với bản trò chơi mới: nếu thấy trang cũ, tải lại trang.

- **Khi nào gặp:** đi bộ ngoài vùng hoang, **thỉnh thoảng** (đi liên tục ngoài vùng hoang vài phút tới mười mấy phút mới gặp một lần, tuỳ độ nguy hiểm của vùng) có kẻ chặn đường: tán tu, tà tu, cường đạo hay yêu thú tuỳ vùng. Có thời gian hồi (khoảng 8 phút sau một lần) và **trần mỗi ngày** (12 lần). Chỉ **đi bộ thật** mới tính; dịch chuyển tức thời không tính.
- **Sẽ KHÔNG bị chặn khi:** đang ở trấn / khu an toàn, trong bí cảnh, đang thách đấu PK, khí huyết dưới 30%, vừa đánh nhau hoặc bị đánh (8 giây), có đồng đội ở gần (khoảng 700 px) đang giao chiến, vừa đầu thai, hoặc đang rớt mạng chờ nối lại.
- **Hộp thoại (10 giây):** nhân vật đứng yên, không ai đánh được. Có ba nút: **Chiến** (phím Enter), **Bỏ chạy: trả Linh thạch**, **Bỏ chạy: trả tu vi**. **Giá hiện ngay trên nút và đúng bằng số bị trừ**; giá tu vi tương đương **khoảng 2 phút săn quái** ở bậc của bạn (giữa trận khoảng 3 phút) và **không bao giờ làm rớt cảnh giới** (không trừ quá số tu vi bạn đang có trong thanh). Hết 10 giây không bấm thì tính là **Chiến**. Bỏ chạy ở hộp thoại: trả giá rồi đi tiếp như chưa có gì.
- **Chiến:** bạn vào một đấu trường nhỏ **một mình** với kẻ chặn đường (đồng đội không vào được), có đồng hồ 2 phút. Hạ hết kẻ chặn đường là **thắng**: nhận tu vi (tương đương khoảng 4 phút săn quái với kẻ chặn đường thường, 6 phút với tinh anh, 10 phút với kẻ cầm đầu, tính theo bậc của bạn) và một ít Linh thạch (đồ rơi và sách chiêu sẽ có sau khi chốt cân bằng); sau vài giây bạn về **đúng chỗ cũ** và được bảo hộ 5 giây.
- **Bỏ chạy giữa trận** luôn bấm được (kể cả khi bị khống chế) nhưng phải **vận 1 giây** mới thoát, và giá **cao hơn** giá ở hộp thoại (Linh thạch gấp đôi, tu vi khoảng 3 phút săn thay vì 2 phút). Bị hạ giữa lúc vận thì tính là thua.
- **Thua là CHẾT THẬT:** bị hạ khi đang đánh trong đấu trường giống như chết ở bản đồ thường: bạn vào **Hoàng Tuyền và mất kiếp** (xem mục Luân hồi bên dưới), không trừ thêm giá. Để việc này công bằng: kẻ chặn đường **không mạnh vượt cảnh giới** của bạn, và **Bỏ chạy luôn là một lựa chọn**.
- **Hết giờ, rời phòng, thoát chủ động:** trả giá giữa trận bằng tu vi (không thể né giá bằng cách thoát).
- **Rớt mạng:** trò chơi **chờ nối lại 90 giây**, đồng hồ hộp thoại / trận **đóng băng** và kẻ địch bỏ mục tiêu; nối lại kịp thì mọi thứ còn nguyên. Chỉ khi quá hạn mới tính giá. Không ai bị phạt oan vì mạng chập chờn.
- **Đội:** người trong đội gặp chặn đường vẫn đấu **một mình** (đấu trường chỉ nhận đúng một người, đồng đội không vào giúp được).

> **Mẹo:** Hộp thoại có giá ngay trên nút, nên hãy quyết định theo khí huyết và đan còn lại. Nếu khí huyết đầy và bạn quen đánh bậc này thì **Chiến** là cách duy nhất để nhận thưởng; chưa chắc thì **Bỏ chạy** bằng Linh thạch cho khỏi tốn tu vi (thua trận là mất kiếp, nên đừng liều). **Hãy luôn mang theo ít nhất 2 Hồi Huyết Đan** (hộp thoại sẽ **nhắc** bằng một dòng vàng dưới nút Chiến khi túi có ít hơn 2 viên đan hồi huyết, tính cả đan Đại và Thượng; chỉ là lời nhắc, không khoá nút. Hộp thoại chỉ có 10 giây nên dòng nhắc nói thẳng việc nên làm: túi không có đan thì **"nên bỏ chạy"**; gặp kẻ **Cầm đầu** mà túi còn dưới 2 đan thì cũng **"nên bỏ chạy"**; còn 1 đan trước kẻ thường hay tinh anh thì chỉ nhắc mang đủ 2; nếu bạn không trả nổi giá bỏ chạy nào thì dòng chỉ nhắc mang đan, vì khi đó bỏ chạy không làm được) và mặc đồ đúng bậc: đo thử cho thấy chiến với 2 đan gần như không chết, nhưng chiến khi không có đan có thể chết cứ sáu bảy lần một lần. Các con số trong mục này (xác suất, hồi, giá, thưởng) **có thể chỉnh** sau khi cân bằng.

Chi tiết thiết kế: [docs/THIET_KE_CHAN_DUONG.md](THIET_KE_CHAN_DUONG.md).

---

## Luân hồi và Hoàng Tuyền

Đây là cơ chế quan trọng nhất cần hiểu rõ:

> **CHẾT DO YÊU THÚ = MẤT MỘT KIẾP.** Khi nhân vật bị quái giết, chân linh của bạn đầu thai sang kiếp mới. **Chết do quái ở bản đồ thường, hoặc thua trong đấu trường của Gặp chặn đường (xem mục Gặp chặn đường ở trên), đều tính là mất kiếp** — chết trong bí cảnh hay trong quyết đấu **không** tính.

Khi đầu thai:

- **Túi đồ và ví bị trống.** Bạn chỉ giữ những gì mở khóa bởi cây **Tam Sinh Thạch** (giữ trang bị, mang theo Linh thạch, sẵn đan hồi…).
- Bạn mang theo **Duyên** — điểm tích luỹ từ cảnh giới đạt được, thời gian sống và số trùm hạ. Duyên mở khóa các nhánh vĩnh viễn ở Tam Sinh Thạch: tăng tốc tu luyện, mang Linh thạch qua kiếp, sẵn đan hồi cho kiếp mới, giữ trang bị, khắc công pháp.
- Bạn chọn lại **xuất thân** (gia thế thường, kiếm khách, thể tu, linh tu), mỗi loại cho một chỉ số ban đầu khác nhau.

> **Mẹo bảo mạng (rất quan trọng):**
> - **Giữ kết nối.** Rớt mạng bất thường, nhân vật vẫn được giữ lại khoảng **90 giây** để nối lại — đừng hoảng, hãy thử nối lại ngay. Thoát chủ động hoặc ngắt vì spam thì không được giữ.
> - Đừng lao vào quái mạnh hơn cảnh giới của bạn. Quái càng xa trấn càng mạnh.
> - Luôn mang đan hồi máu; uống trước khi máu xuống nửa.
> - Với trùm, đi đội. Một người thường không hạ nổi.

Chi tiết thiết kế luân hồi: [docs/THIET_KE_LUAN_HOI.md](THIET_KE_LUAN_HOI.md).

---

## PK thách đấu

- Thách đấu là **hai bên đồng ý**: dùng **menu đồng đạo (P)** để thách, đối phương bấm **Y** nhận / **X** từ chối. Lời mời hết hạn sau 20 giây.
- Điều kiện: cùng khu vực, **ngoài khu an toàn**, cả hai đang sống, đứng gần nhau, và không trong bí cảnh.
- Trận đếm ngược 3 giây rồi bắt đầu, tối đa **3 phút**; hết giờ mà không ai thua là **hoà**.
- Trong trận: **không uống đan, không hồi máu, không đả tọa.** Sát thương PK bị giảm mạnh nên trận thường kéo dài — đây là thử thách kỹ năng thuần túy. Bấm **R** để đầu hàng.
- **Chết trong quyết đấu KHÔNG mất kiếp** — bạn hồi lại với 30% máu.

> **Mẹo:** Thách đấu là cách thử trình độ với đồng đạo, không rủi ro mất kiếp. Hãy thách ai đó ngang cấp để công bằng.

Chi tiết thiết kế: [docs/THIET_KE_PK.md](THIET_KE_PK.md).

---

## Tông môn

- **Lập tông:** tốn **1.000 Linh thạch**, đặt tên (2–16 ký tự) và biệt hiệu (2–4 ký tự). Bạn trở thành **Tông chủ**.
- **Chức vụ:** Tông chủ, Trưởng lão, Đệ tử. Tông chủ có thể phong Trưởng lão / Đệ tử và chuyển ngôi.
- **Mời thành viên:** qua menu đồng đạo; lời mời hết hạn 30 giây. Rời rồi gia nhập lại phải chờ 10 phút.
- **Kho đồ chung:** các thành viên góp / rút đồ. Số ô kho mở rộng theo cấp tông (từ 40 ô lên tới 80 ô); Đệ tử rút có hạn mỗi ngày.
- **Cống hiến và cấp tông:** bạn kiếm **cống hiến** bằng ba nguồn: **nhiệm vụ tông môn** hằng ngày, **góp Linh thạch / đồ vào kho** (tối đa 30 cống hiến mỗi ngày từ nguồn này) và **hoàn thành bí cảnh cùng nhóm có ít nhất hai thành viên cùng tông** (20 cống hiến mỗi người, một lần mỗi ngày). **Tối đa 140 cống hiến mỗi ngày mỗi người** (nhiệm vụ 90 + góp 30 + bí cảnh 20). Chỉ kiếm được khi bạn đã vào tông **từ trước hôm nay**. Cống hiến của bạn cũng cộng vào **điểm tông**; điểm tông không bao giờ giảm và quyết định **cấp tông**.
- **Nội vụ (mở tab "Nội vụ" ở bảng Tông môn, phím G):**
  - **Ba nhiệm vụ mỗi ngày** (độ khó 20 / 30 / 40 cống hiến), theo bậc của bạn: hạ quái, nộp nguyên liệu... Mỗi mẫu nhiệm vụ chỉ trả một lần mỗi ngày; hết ngày thì làm mới.
  - **Cửa hàng tông môn** (28 món, hai gian): **Bảo khố** (đan, nguyên liệu, đồ) và **Tàng Kinh Các** (kinh quyển chiêu thức). Mua bằng cống hiến; món mở dần theo cấp tông (nhóm "Mở ở cấp tông N" gập lại ở những cấp bạn chưa tới); mỗi món có **hạn mức mua mỗi ngày**; kinh quyển đã học thì khoá. Cống hiến mua hàng bị trừ nhưng **không làm tông hạ cấp**.
  - Ảnh chụp bảng luôn là số của máy chủ; thấy lệch thì mở lại bảng.
- **Cấp tông** có 5 bậc theo điểm tông: **Sơ Lập** (0), **Tiểu Thành** (1.000), **Trung Hưng** (4.000), **Hưng Vượng** (12.000), **Đỉnh Thịnh** (30.000); lên cấp thì thêm chỗ thành viên, thêm ô kho và mở thêm hàng ở cửa hàng. **Buff cho mọi thành viên đang trực tuyến**: tu vi +2% / +3% / +4% / +5% (cấp 2-5), cơ hội rơi đồ +3% / +5% / +5% (cấp 3-5), hồi phục ngoài đả tọa +10% / +15% (cấp 4-5). Tông 3 người làm đủ trần mỗi ngày lên cấp 5 trong khoảng 10 tuần; làm chỉ nhiệm vụ thì khoảng 16 tuần.
- **Gõ số lượng trực tiếp:** khi góp / rút đồ ở kho tông, góp / rút Linh thạch ở quỹ, đổi nhiều món ở cửa hàng tông (nút **Nhiều…** cạnh **Đổi**), mua / bán ở cửa hàng NPC (mỗi thẻ **Mua** / **Bán** có ô riêng) và vứt đồ ở túi (ô có từ 2 cái), bạn có một **ô nhập số** (điện thoại hiện bàn phím số) cùng nút **− / +**, **×10 / ×100** (nhân số đang có), **Tối đa** và giữ nút để tăng nhanh dần. Gõ quá giới hạn thì ô tự kẹp về mức tối đa và báo rõ; chỉ nhận số nguyên dương viết liền hoặc có dấu nghìn đúng kiểu (`1.000`), gõ `2.5` là sai chứ không bị đoán thành số khác. **Enter** xác nhận, **Esc** huỷ; đang gõ trong ô thì phím không điều khiển nhân vật. Ở cửa hàng NPC, **Mua** kẹp theo số Linh thạch bạn có (không đủ cả một cái thì nút mờ kèm "Thiếu N") và **Bán** kẹp theo số đang có, tối đa **99 mỗi lần** (ngăn xếp lớn hơn thì bán từng đợt); đồ quý vẫn có hộp xác nhận nêu đúng số lượng.
- **Rời tông thì MẤT cống hiến** của bạn (hộp xác nhận hiện đúng số sẽ mất). Cống hiến gắn với **linh hồn**: qua đầu thai vẫn còn, nhưng nhảy sang tông khác để lấy lại trần ngày là không được.

> **Mẹo:** Tham gia tông môn mang lại buff vĩnh viễn cho mọi hoạt động cày cuốc. Góp đồ vào kho chung để cả tông mạnh lên — đó cũng là cách tích cống hiến của riêng bạn.

Chi tiết thiết kế: [docs/THIET_KE_TONG_MON.md](THIET_KE_TONG_MON.md).

Chat trong tông môn: gõ **`/s`** rồi nội dung. Chat đội: gõ **`/p`** rồi nội dung (đi theo đội, kể cả khi thành viên sang bản đồ khác). Chat thường (không tiền tố) gửi cho cả server.

---

## Xã hội: xếp hạng, thành tựu, trùm thế giới

Bấm nút **Xã hội** trên HUD (điện thoại: trong menu ☰) hoặc phím **Shift + G** để mở bảng ba tab; **Esc** đóng.

- **Xếp hạng:** bốn bảng **Tu vi**, **Linh hồn**, **Tông môn**, **Thách đấu**. Dòng của bạn được tô sáng; nếu bạn ngoài top, dòng của bạn hiện ở cuối kèm số liệu. Không có hạng thì bảng nói lý do (tài khoản thử nghiệm, chưa đủ số trận thách đấu, chưa thuộc tông môn nào...). Bảng làm mới định kỳ nên con số có thể chậm vài phút; ô "tuổi bản chụp" cho biết số liệu cũ đến đâu.
- **Thành tựu:** sổ theo nhóm (luân hồi, trùm, bản đồ...) với thanh tiến độ và phần thưởng bằng chữ. Hoàn thành thành tựu có thể mở **danh hiệu**: chọn **đeo** hoặc **gỡ** ở đầu tab; danh hiệu hiện cạnh tên trên đầu nhân vật và trong chat. Thành tựu mới có dấu **Mới** và một chấm nhỏ trên nút Xã hội cho tới khi bạn mở tab. Thành tựu và danh hiệu thuộc về **linh hồn** nên giữ nguyên qua các kiếp.
- **Sự kiện:** lịch **trùm thế giới** (giờ Việt Nam). Trước giờ trùm xuất hiện có báo trước; khi trùm đang ở bản đồ đích, đầu màn hình hiện **banner** đếm ngược, máu trùm, phần đóng góp của bạn và danh sách người đóng góp nhiều nhất (bấm để mở / thu gọn). Cần đóng góp đủ ngưỡng mới nhận thưởng; banner cho biết bạn đã đủ điều kiện chưa. Hết sự kiện, banner đổi thành kết quả ít giây.

Nếu bảng Xã hội gặp lỗi ở máy bạn, thêm `?social=0` vào cuối địa chỉ trang để tắt tạm (nút, phím tắt, banner và danh hiệu cùng ẩn) rồi báo cho nhóm.

## Phụ lục: quái theo bậc và bản đồ

### Quái tiêu biểu theo vùng (sắp theo độ mạnh tăng dần)

| Quái | Vùng | Đặc điểm |
| --- | --- | --- |
| Linh Thố | Vân Mộng Sơn (gần trấn) | Không hung, tập sự |
| Hôi Lang | Cỏ cao ngoài trấn | Lao tới, đi bầy |
| Hắc Hổ | Rừng xa | Đòn nặng, chảy máu nhẹ |
| Xích Mãng (trùm) | Hang sâu Vân Mộng | Trùm Trúc Cơ, nên đi đội |
| Sương Hồ | Đầm Âm Sương | Đứng xa bắn đạn băng |
| Thạch Quy | Đầm Âm Sương | Máu dày, chậm |
| Độc Thiềm | Đầm Âm Sương (sâu) | Nhổ đạn độc |
| Hắc Giao (trùm) | Hang sâu đầm | Trùm Kim Đan, đội 3–4 người |
| Hàn Lang | Băng nguyên Hàn Vân | Lao thẳng |
| Phong Nha | Băng nguyên Hàn Vân | Bắn đạn kim từ xa |
| Cốt Tượng | Băng nguyên Hàn Vân | Máu rất dày, đập đất |
| Độc Tước | Băng nguyên Hàn Vân (sâu) | Đạn độc, công cao máu mỏng |
| Thiên Hàn Vương (trùm) | Đỉnh băng | Trùm Nguyên Anh, đội 3–4 người |

### Bản đồ

| Bản đồ | Kích thước | Điểm mốc |
| --- | --- | --- |
| Lạc Hà Trấn | 96 × 96 | Trấn an toàn ở giữa, chân Vân Mộng Sơn |
| Hắc Phong Cốc | 128 × 96 | Thanh Lộ Trạm (nam) |
| Âm Sương Trạch | 128 × 112 | Vọng Sương Trạm |
| Hàn Vân Lĩnh | 128 × 128 | Hàn Vân Trạm |
| Linh Hư Bí Cảnh | 64 × 64 | Bí cảnh (vào qua Thủ môn) |

Khu an toàn là trong trấn hoặc trong bán kính quanh cổng. Càng ra xa trấn, yêu thú càng mạnh và càng nguy hiểm.

---

*Cập nhật từ dữ liệu thật trong `shared/`. Nếu phát hiện số sai, hãy báo để sửa — tài liệu này không được phép bịa số.*
